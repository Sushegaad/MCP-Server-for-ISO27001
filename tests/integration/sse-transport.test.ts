/**
 * Integration tests for src/transport/sse.ts (HTTP-level behaviour)
 *
 * Drives the real Express app returned by buildSseApp() over an ephemeral
 * port, with auth (validateKey/loadRole) mocked the same way the unit
 * tests mock the DB. The full SSE event-stream handshake is intentionally
 * NOT driven here — holding a live event-stream open inside vitest is
 * flaky; these tests pin down every HTTP-level contract instead:
 *
 *   • GET  /health            → 200
 *   • GET  /sse without/with bad Authorization → 401 (no session created)
 *   • POST /messages sessionId validation → 400 for missing / array /
 *     malformed values BEFORE any session lookup
 *   • POST /messages with well-formed but unknown UUID → 404
 *   • Revocation eviction via the real session-store
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";

// ── Auth mock (module-level, before SUT import) ───────────────

vi.mock("../../src/auth/api-key.js", () => ({
  validateKey: vi.fn((rawKey: string) => {
    if (rawKey === "iso27001_valid_test_key") return "test-key-hash";
    throw new Error("Invalid or missing API key");
  }),
  loadRole: vi.fn(() => "admin"),
}));

// ── SUT imports (after vi.mock) ───────────────────────────────

import { buildSseApp } from "../../src/transport/sse.js";
import {
  createSessionToken,
  lookupSessionToken,
  removeSessionToken,
  removeSessionsByKeyHash,
} from "../../src/auth/session-store.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// buildSseApp only touches the McpServer inside the /sse success path
// (server.connect) — a stub is sufficient for the HTTP-level contracts.
const serverStub = { connect: vi.fn() } as unknown as McpServer;

let httpServer: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = buildSseApp(serverStub);
  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
});

// ── /health ───────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; mode: string };
    expect(body.status).toBe("ok");
    expect(body.mode).toBe("sse");
  });
});

// ── /sse auth ─────────────────────────────────────────────────

describe("GET /sse authentication", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await fetch(`${baseUrl}/sse`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with an invalid bearer token", async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: { Authorization: "Bearer iso27001_wrong_key" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 for a non-Bearer Authorization scheme", async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("does not call server.connect on auth failure", () => {
    expect(serverStub.connect).not.toHaveBeenCalled();
  });
});

// ── /messages sessionId validation ────────────────────────────

describe("POST /messages sessionId validation", () => {
  const postMessage = (query: string) =>
    fetch(`${baseUrl}/messages${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });

  it("returns 400 when sessionId is missing", async () => {
    const res = await postMessage("");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid sessionId" });
  });

  it("returns 400 when sessionId is repeated (array)", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const res = await postMessage(`?sessionId=${a}&sessionId=${b}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid sessionId" });
  });

  it("returns 400 for a malformed non-UUID string", async () => {
    const res = await postMessage("?sessionId=not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid sessionId" });
  });

  it("returns 400 for a UUID with trailing junk", async () => {
    const res = await postMessage(`?sessionId=${randomUUID()}x`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid sessionId" });
  });

  it("returns 404 for a well-formed but unknown UUID", async () => {
    const unknown = randomUUID();
    const res = await postMessage(`?sessionId=${unknown}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(`Session not found: ${unknown}`);
  });
});

// ── Revocation eviction (real session-store) ──────────────────

describe("session revocation eviction", () => {
  it("removeSessionsByKeyHash evicts all sessions for a key hash", () => {
    const tok1 = createSessionToken("revoked-hash", "admin");
    const tok2 = createSessionToken("revoked-hash", "analyst");
    const other = createSessionToken("other-hash", "viewer");

    expect(lookupSessionToken(tok1)).toEqual({ keyHash: "revoked-hash", role: "admin" });
    expect(lookupSessionToken(tok2)).toEqual({ keyHash: "revoked-hash", role: "analyst" });

    const evicted = removeSessionsByKeyHash("revoked-hash");
    expect(evicted).toBe(2);

    // Subsequent lookups fail — the tool pipeline would raise AUTH_INVALID.
    expect(lookupSessionToken(tok1)).toBeUndefined();
    expect(lookupSessionToken(tok2)).toBeUndefined();

    // Unrelated sessions are untouched.
    expect(lookupSessionToken(other)).toEqual({ keyHash: "other-hash", role: "viewer" });
    removeSessionToken(other);
  });
});
