/**
 * SSE transport module for iso27001-mcp.
 * Starts an Express server that exposes the MCP server over Server-Sent Events.
 *
 * Security:
 *   • /sse requires Authorization: Bearer <iso27001_...> at connect time.
 *     The key is validated via HMAC and the role is bound to the session.
 *   • On /messages, the session-bound raw key is injected into _meta.apiKey
 *     before the message is forwarded, preventing mid-stream key substitution.
 *   • MCP_API_KEY env var is accepted as a fallback for deployments that
 *     don't use per-request Authorization headers.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateKey, loadRole } from "../auth/api-key.js";
import { McpError } from "../types/errors.js";

// ── Session store ─────────────────────────────────────────────

interface SessionEntry {
  transport:    SSEServerTransport;
  createdAt:    number;
  lastActivity: number;
  /** HMAC hash of the key bound at connect time — used for audit log correlation. */
  keyHash:      string;
  /** Raw key bound at connect time — injected into every /messages request. */
  rawKey:       string;
}

const sessions = new Map<string, SessionEntry>();

// ── TTL cleanup ───────────────────────────────────────────────

const ttlMs =
  parseInt(process.env["SESSION_TTL_HOURS"] ?? "4") * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastActivity > ttlMs) {
      // Close the underlying response if possible
      try {
        (entry.transport as unknown as { res?: { end(): void } }).res?.end();
      } catch {
        // ignore
      }
      sessions.delete(sessionId);
      console.error(`[iso27001-mcp] Session ${sessionId} expired and removed.`);
    }
  }
}, 60_000);

// ── Main export ───────────────────────────────────────────────

export function startSseServer(server: McpServer): void {
  const isProduction = process.env["NODE_ENV"] === "production";
  const port = parseInt(process.env["SSE_PORT"] ?? "3000", 10);

  // TLS warning
  if (isProduction && process.env["BEHIND_TLS_PROXY"] !== "true") {
    console.error(
      "[SECURITY] Running in production without BEHIND_TLS_PROXY=true. Ensure TLS is terminated upstream.",
    );
  }

  const app = express();

  // ── CORS middleware ────────────────────────────────────────
  app.use((req, res, next) => {
    const allowedOrigin = isProduction ? "https://claude.ai" : "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ── Parse JSON bodies (for POST /messages) ─────────────────
  app.use(express.json());

  // ── Rate limiting on /messages ─────────────────────────────
  if (isProduction) {
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use("/messages", limiter);
  }

  // ── Routes ─────────────────────────────────────────────────

  // Health check (no auth)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), mode: "sse" });
  });

  // SSE connection endpoint — requires Bearer token auth at connect time
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/sse", async (req, res) => {
    // ── Auth: extract Bearer token ────────────────────────────
    const authHeader = req.headers["authorization"];
    const rawKey =
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
      process.env["MCP_API_KEY"] ??
      "";

    let keyHash: string;
    try {
      keyHash = validateKey(rawKey);
      loadRole(keyHash);  // checks expiry + revocation
    } catch (err) {
      const msg = err instanceof McpError ? err.message : "Invalid or missing API key";
      res.status(401).json({
        error: "Unauthorized",
        message: msg,
        hint: "Pass Authorization: Bearer <iso27001_...> header at connect time.",
      });
      return;
    }

    const sessionId = randomUUID();

    const transport = new SSEServerTransport("/messages", res);

    sessions.set(sessionId, {
      transport,
      createdAt:    Date.now(),
      lastActivity: Date.now(),
      keyHash,
      rawKey,
    });

    res.on("close", () => {
      sessions.delete(sessionId);
      console.error(`[iso27001-mcp] SSE connection closed for session ${sessionId}.`);
    });

    // Connect the MCP server to this transport
    await server.connect(transport);

    // Send the session ID as the first SSE event
    res.write("data: " + JSON.stringify({ type: "session", sessionId }) + "\n\n");
  });

  // Message handler endpoint
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post("/messages", async (req, res) => {
    const sessionId = req.query["sessionId"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId query parameter." });
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    // Update last activity
    entry.lastActivity = Date.now();

    // ── Pin the session-bound API key ─────────────────────────
    // Inject the key from connect-time auth into _meta.apiKey so the tool
    // pipeline always uses the key bound at /sse time.  This prevents a
    // client from substituting a different (higher-privilege) key mid-stream
    // via _meta.apiKey in the JSON-RPC body.
    if (entry.rawKey && req.body && typeof req.body === "object") {
      const body = req.body as { params?: Record<string, unknown> };
      if (body.params && typeof body.params === "object") {
        const meta = ((body.params["_meta"] ?? {}) as Record<string, unknown>);
        meta["apiKey"] = entry.rawKey;
        body.params["_meta"] = meta;
      }
    }

    await entry.transport.handlePostMessage(req, res);
  });

  // ── Start listening ────────────────────────────────────────
  app.listen(port, () => {
    console.error(`[iso27001-mcp] SSE server listening on port ${port}.`);
  });
}
