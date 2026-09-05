/**
 * iso27001-mcp — SSE session token store
 *
 * Provides a one-level indirection between an SSE session and its API key
 * so that the raw key is NEVER stored in server memory after the initial
 * HMAC validation at /sse connect time.
 *
 * Flow:
 *   1. /sse validates Bearer token → keyHash + role
 *   2. createSessionToken(keyHash, role) → opaque token stored in _meta.apiKey
 *   3. /messages injects the session token (not the raw key) into each request
 *   4. Tool pipeline calls lookupSessionToken() → { keyHash, role } directly,
 *      skipping validateKey() since auth already happened at connect time
 *   5. Session token is removed when the SSE connection closes
 *
 * The session token has the prefix "iso27001_sess_" and is otherwise a UUID.
 * It is NOT an API key and cannot be used outside of an active SSE session.
 */

import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────

export interface SessionAuth {
  keyHash: string;
  role:    string;
}

// ── Store ─────────────────────────────────────────────────────

const SESSION_TOKEN_PREFIX = "iso27001_sess_";

// In-memory only — intentionally not persisted to disk or DB.
// Entries live exactly as long as the SSE connection that created them.
const store = new Map<string, SessionAuth>();

// ── Public API ────────────────────────────────────────────────

/**
 * Create a new session token linked to a pre-validated keyHash and role.
 * The raw API key is NOT stored — only its HMAC hash.
 */
export function createSessionToken(keyHash: string, role: string): string {
  const token = `${SESSION_TOKEN_PREFIX}${randomUUID()}`;
  store.set(token, { keyHash, role });
  return token;
}

/**
 * Look up a session token. Returns the associated auth if found, undefined
 * otherwise. Callers should treat an undefined return as an auth failure.
 */
export function lookupSessionToken(token: string): SessionAuth | undefined {
  return store.get(token);
}

/**
 * Remove a session token when its SSE connection closes.
 */
export function removeSessionToken(token: string): void {
  store.delete(token);
}

/**
 * Evict every live session created under a given key hash. Called by
 * revoke_api_key so a revoked key's open SSE sessions cannot make further
 * tool calls. This is the single enforcement point: every SSE tool call
 * resolves its credential through lookupSessionToken(), so deleting the
 * token here immediately turns subsequent calls into AUTH_INVALID —
 * regardless of whether the underlying SSE connection is still open
 * (the transport map in sse.ts holds no auth material).
 * Returns the number of sessions evicted.
 */
export function removeSessionsByKeyHash(keyHash: string): number {
  let evicted = 0;
  for (const [token, auth] of store) {
    if (auth.keyHash === keyHash) {
      store.delete(token);
      evicted++;
    }
  }
  return evicted;
}

/**
 * Returns true if the value looks like a session token (prefix check only —
 * does not confirm the token exists in the store).
 */
export function isSessionToken(value: string): boolean {
  return value.startsWith(SESSION_TOKEN_PREFIX);
}
