/**
 * SSE transport module for iso27001-mcp.
 * Starts an Express server that exposes the MCP server over Server-Sent Events.
 *
 * Security model
 * ──────────────
 * • /sse requires Authorization: Bearer <iso27001_...> at connect time.
 *   The raw key is validated once, then immediately discarded.
 *   Only the HMAC hash (keyHash) is retained — never the raw key.
 *
 * • A short-lived session token (iso27001_sess_<UUID>) is created and stored
 *   in the session entry. This token is injected into every /messages request
 *   as _meta.apiKey. The tool pipeline resolves it via session-store.ts,
 *   which returns { keyHash, role } without re-exposing the raw key.
 *
 * • Session tokens are removed from the store when the SSE connection closes,
 *   so they cannot be reused after disconnection.
 *
 * • MCP_API_KEY env var is used by the stdio pipeline only (src/tools/index.ts).
 *   The SSE /sse endpoint does NOT fall back to env — Bearer is always required.
 *
 * • CORS_ORIGIN env var controls the allowed origin (default: http://localhost
 *   in dev, https://claude.ai in production). Never set to '*' in production.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateKey, loadRole } from "../auth/api-key.js";
import { createSessionToken, removeSessionToken } from "../auth/session-store.js";
import { McpError } from "../types/errors.js";

// ── Session store ─────────────────────────────────────────────

interface SessionEntry {
  transport:    SSEServerTransport;
  createdAt:    number;
  lastActivity: number;
  /** Opaque session token — injected into _meta.apiKey on each /messages request.
   *  Maps to { keyHash, role } in session-store.ts. The raw API key is NOT stored. */
  sessionToken: string;
}

const sessions = new Map<string, SessionEntry>();

// ── TTL cleanup ───────────────────────────────────────────────

const ttlMs =
  parseInt(process.env["SESSION_TTL_HOURS"] ?? "4") * 60 * 60 * 1000;

const ttlSweep = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastActivity > ttlMs) {
      try {
        (entry.transport as unknown as { res?: { end(): void } }).res?.end();
      } catch {
        // ignore
      }
      removeSessionToken(entry.sessionToken);
      sessions.delete(sessionId);
      console.error(`[iso27001-mcp] Session ${sessionId} expired and removed.`);
    }
  }
}, 60_000);

// The sweep must not keep the process alive on its own — the HTTP listener
// does that. This also lets test runners import this module without hanging.
ttlSweep.unref();

// ── sessionId validation ──────────────────────────────────────
// Session IDs are minted with randomUUID() at /sse connect time, so any
// /messages sessionId that is not a single well-formed UUID string is
// rejected up front — before any session lookup. Express 5's simple query
// parser can still yield string[] for repeated params (?sessionId=a&b).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Explicit request-body cap for /messages. Matches the MCP SDK's own
// per-message limit (MAXIMUM_MESSAGE_SIZE = '4mb' in server/sse.js) so the
// Express layer rejects oversized payloads before they reach the transport.
const JSON_BODY_LIMIT = "4mb";

// ── App construction (exported for integration tests) ────────

export function buildSseApp(server: McpServer): express.Express {
  const isProduction = process.env["NODE_ENV"] === "production";

  const app = express();

  // ── CORS ──────────────────────────────────────────────────
  // Origin is configurable via CORS_ORIGIN env var.
  // Never defaults to '*' — wildcard is incompatible with Authorization headers
  // (browsers block credentialed requests to '*' per the Fetch spec) and
  // broadens attack surface unnecessarily.
  app.use((req, res, next) => {
    const allowedOrigin =
      process.env["CORS_ORIGIN"] ??
      (isProduction ? "https://claude.ai" : "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // HTTP-level rate limit applies in ALL modes (not just production) —
  // the in-process per-key limiter (rate-limiter.ts) still applies on top.
  const limiter = rateLimit({
    windowMs: 60 * 1000, max: 100,
    standardHeaders: true, legacyHeaders: false,
  });
  app.use("/messages", limiter);

  // ── Routes ────────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), mode: "sse" });
  });

  // SSE connection endpoint — validates Bearer token and binds a session token.
  // The raw key is used only here; it is NOT stored after this handler returns.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/sse", async (req, res) => {
    // ── Step 1: extract Bearer token ──────────────────────────
    // SSE always requires Authorization: Bearer — no env fallback here.
    // The MCP_API_KEY env var is for the stdio pipeline only (src/tools/index.ts).
    const authHeader = req.headers["authorization"];
    const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // ── Step 2: validate once — raw key used here only ────────
    let keyHash: string;
    let role: string;
    try {
      keyHash = validateKey(rawKey);
      role    = loadRole(keyHash);   // checks expiry + revocation
    } catch (err) {
      const msg = err instanceof McpError ? err.message : "Invalid or missing API key";
      res.status(401).json({
        error: "Unauthorized",
        message: msg,
        hint: "Pass 'Authorization: Bearer <iso27001_...>' header at /sse connect time. MCP_API_KEY env fallback is not accepted over SSE.",
      });
      return;
      // rawKey goes out of scope here — never stored
    }

    // ── Step 3: create session token (no raw key retained) ────
    const sessionToken = createSessionToken(keyHash, role);
    const sessionId    = randomUUID();
    const transport    = new SSEServerTransport("/messages", res);

    sessions.set(sessionId, {
      transport,
      createdAt:    Date.now(),
      lastActivity: Date.now(),
      sessionToken,
    });

    res.on("close", () => {
      removeSessionToken(sessionToken);
      sessions.delete(sessionId);
      console.error(`[iso27001-mcp] SSE session ${sessionId} closed.`);
    });

    await server.connect(transport);
    res.write("data: " + JSON.stringify({ type: "session", sessionId }) + "\n\n");
  });

  // Message handler — injects the session token (not the raw key) into _meta.apiKey.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post("/messages", async (req, res) => {
    // Defense-in-depth: sessionId must be a single well-formed UUID string.
    // Arrays (repeated params), objects, malformed strings, and missing
    // values are all rejected BEFORE any session lookup.
    const rawSessionId: unknown = req.query["sessionId"];
    if (typeof rawSessionId !== "string" || !UUID_RE.test(rawSessionId)) {
      res.status(400).json({ error: "invalid sessionId" });
      return;
    }
    const sessionId = rawSessionId;

    const entry = sessions.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    entry.lastActivity = Date.now();

    // Inject the opaque session token as _meta.apiKey so the tool pipeline
    // can resolve { keyHash, role } without re-exposing any raw key material.
    if (req.body && typeof req.body === "object") {
      const body = req.body as { params?: Record<string, unknown> };
      if (body.params && typeof body.params === "object") {
        const meta = ((body.params["_meta"] ?? {}) as Record<string, unknown>);
        meta["apiKey"] = entry.sessionToken;
        body.params["_meta"] = meta;
      }
    }

    // express.json() has already consumed the request stream, so the parsed
    // (and token-injected) body MUST be handed to the transport explicitly —
    // the SDK only falls back to reading the raw stream when no parsedBody
    // is provided, and a consumed stream would yield an empty message.
    await entry.transport.handlePostMessage(req, res, req.body);
  });

  return app;
}

// ── Main export ───────────────────────────────────────────────

export function startSseServer(server: McpServer): void {
  const isProduction = process.env["NODE_ENV"] === "production";
  const port = parseInt(process.env["SSE_PORT"] ?? "3000", 10);

  if (isProduction && process.env["BEHIND_TLS_PROXY"] !== "true") {
    console.error(
      "[SECURITY] Running in production without BEHIND_TLS_PROXY=true. Ensure TLS is terminated upstream.",
    );
  }

  const app = buildSseApp(server);

  // Bind to loopback by default — exposing the SSE server on all interfaces
  // must be a deliberate operator decision (SSE_HOST=0.0.0.0), ideally
  // behind a TLS-terminating proxy.
  const host = process.env["SSE_HOST"] ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.error(`[iso27001-mcp] SSE server listening on ${host}:${port}.`);
  });
}
