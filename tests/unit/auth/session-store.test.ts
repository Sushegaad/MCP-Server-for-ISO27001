/**
 * Unit tests for src/auth/session-store.ts
 *
 * Covers: createSessionToken, lookupSessionToken, removeSessionToken, isSessionToken
 * The store is a module-level Map, so we clean up tokens we create between tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSessionToken,
  lookupSessionToken,
  removeSessionToken,
  isSessionToken,
} from "../../../src/auth/session-store.ts";

// Track tokens created so we can clean up after each test
let created: string[] = [];

beforeEach(() => {
  for (const t of created) removeSessionToken(t);
  created = [];
});

// ── createSessionToken ────────────────────────────────────────

describe("createSessionToken", () => {
  it("returns a string beginning with iso27001_sess_", () => {
    const tok = createSessionToken("hash1", "admin");
    created.push(tok);
    expect(tok.startsWith("iso27001_sess_")).toBe(true);
  });

  it("appends a UUID after the prefix (contains hyphens)", () => {
    const tok = createSessionToken("h", "viewer");
    created.push(tok);
    const suffix = tok.slice("iso27001_sess_".length);
    // UUID v4 pattern
    expect(suffix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates a different token on every call", () => {
    const t1 = createSessionToken("h", "admin");
    const t2 = createSessionToken("h", "admin");
    created.push(t1, t2);
    expect(t1).not.toBe(t2);
  });

  it("stores keyHash and role so lookupSessionToken can retrieve them", () => {
    const tok = createSessionToken("myhash", "analyst");
    created.push(tok);
    const auth = lookupSessionToken(tok);
    expect(auth).toEqual({ keyHash: "myhash", role: "analyst" });
  });

  it("stores admin role correctly", () => {
    const tok = createSessionToken("adminhash", "admin");
    created.push(tok);
    expect(lookupSessionToken(tok)?.role).toBe("admin");
  });

  it("stores viewer role correctly", () => {
    const tok = createSessionToken("viewhash", "viewer");
    created.push(tok);
    expect(lookupSessionToken(tok)?.role).toBe("viewer");
  });
});

// ── lookupSessionToken ────────────────────────────────────────

describe("lookupSessionToken", () => {
  it("returns undefined for an unknown token", () => {
    expect(lookupSessionToken("iso27001_sess_00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(lookupSessionToken("")).toBeUndefined();
  });

  it("returns the stored SessionAuth for a valid token", () => {
    const tok = createSessionToken("keyhash", "viewer");
    created.push(tok);
    const auth = lookupSessionToken(tok);
    expect(auth).toBeDefined();
    expect(auth!.keyHash).toBe("keyhash");
    expect(auth!.role).toBe("viewer");
  });

  it("returns undefined after the token has been removed", () => {
    const tok = createSessionToken("h", "admin");
    removeSessionToken(tok);
    // don't push to created since already removed
    expect(lookupSessionToken(tok)).toBeUndefined();
  });

  it("does not cross-contaminate between sessions", () => {
    const t1 = createSessionToken("h1", "admin");
    const t2 = createSessionToken("h2", "viewer");
    created.push(t1, t2);
    expect(lookupSessionToken(t1)?.keyHash).toBe("h1");
    expect(lookupSessionToken(t2)?.keyHash).toBe("h2");
  });
});

// ── removeSessionToken ────────────────────────────────────────

describe("removeSessionToken", () => {
  it("deletes the token so subsequent lookups return undefined", () => {
    const tok = createSessionToken("h", "admin");
    removeSessionToken(tok);
    expect(lookupSessionToken(tok)).toBeUndefined();
  });

  it("is idempotent — removing an already-removed token does not throw", () => {
    const tok = createSessionToken("h", "admin");
    removeSessionToken(tok);
    expect(() => removeSessionToken(tok)).not.toThrow();
  });

  it("is safe to call with a non-existent key", () => {
    expect(() => removeSessionToken("iso27001_sess_does-not-exist")).not.toThrow();
  });

  it("only removes the specified token, leaving others intact", () => {
    const t1 = createSessionToken("h1", "admin");
    const t2 = createSessionToken("h2", "viewer");
    created.push(t2); // t1 will be removed in the test
    removeSessionToken(t1);
    expect(lookupSessionToken(t1)).toBeUndefined();
    expect(lookupSessionToken(t2)).toBeDefined();
  });
});

// ── isSessionToken ────────────────────────────────────────────

describe("isSessionToken", () => {
  it("returns true for a freshly created token", () => {
    const tok = createSessionToken("h", "admin");
    created.push(tok);
    expect(isSessionToken(tok)).toBe(true);
  });

  it("returns true for any string with the iso27001_sess_ prefix", () => {
    expect(isSessionToken("iso27001_sess_arbitrary-suffix")).toBe(true);
  });

  it("returns false for a plain API key (iso27001_ without sess_)", () => {
    expect(isSessionToken("iso27001_abc123def456")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isSessionToken("")).toBe(false);
  });

  it("returns false for an unrelated string", () => {
    expect(isSessionToken("Bearer some-other-token")).toBe(false);
  });

  it("is a prefix check only — returns true even if token not in store", () => {
    // Removed token still matches prefix
    const tok = createSessionToken("h", "admin");
    removeSessionToken(tok);
    expect(isSessionToken(tok)).toBe(true);
  });
});
