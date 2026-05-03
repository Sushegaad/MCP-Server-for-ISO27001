/**
 * Unit tests for src/security/secrets.ts
 *
 * Tests: requireEnv, loadSecrets
 * No DB dependency — pure env-var logic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv, getEnv, loadSecrets } from "../../../src/security/secrets.js";

// ── requireEnv ────────────────────────────────────────────────────────────

describe("requireEnv", () => {
  afterEach(() => {
    delete process.env["TEST_SECRETS_VAR"];
  });

  it("returns the value when the env var is set", () => {
    process.env["TEST_SECRETS_VAR"] = "hello-world";
    expect(requireEnv("TEST_SECRETS_VAR")).toBe("hello-world");
  });

  it("throws an Error naming the missing variable when not set", () => {
    delete process.env["TEST_SECRETS_VAR"];
    expect(() => requireEnv("TEST_SECRETS_VAR")).toThrow(Error);
    try {
      requireEnv("TEST_SECRETS_VAR");
    } catch (err) {
      expect((err as Error).message).toContain("TEST_SECRETS_VAR");
    }
  });
});

// ── getEnv ────────────────────────────────────────────────────

describe("getEnv", () => {
  afterEach(() => {
    delete process.env["TEST_GETENV_VAR"];
  });

  it("returns the env var value when the variable is set", () => {
    process.env["TEST_GETENV_VAR"] = "hello";
    expect(getEnv("TEST_GETENV_VAR", "default")).toBe("hello");
  });

  it("returns the defaultValue when the variable is not set", () => {
    delete process.env["TEST_GETENV_VAR"];
    expect(getEnv("TEST_GETENV_VAR", "my-default")).toBe("my-default");
  });
});

// ── loadSecrets ───────────────────────────────────────────────────────────

describe("loadSecrets", () => {
  const savedEncKey = process.env["DB_ENCRYPTION_KEY"];
  const savedHmac   = process.env["HMAC_SECRET"];

  beforeEach(() => {
    // Ensure we start with the vars absent so each test controls them
    delete process.env["DB_ENCRYPTION_KEY"];
    delete process.env["HMAC_SECRET"];
  });

  afterEach(() => {
    // Restore whatever was there before (or delete if it was absent)
    if (savedEncKey !== undefined) {
      process.env["DB_ENCRYPTION_KEY"] = savedEncKey;
    } else {
      delete process.env["DB_ENCRYPTION_KEY"];
    }
    if (savedHmac !== undefined) {
      process.env["HMAC_SECRET"] = savedHmac;
    } else {
      delete process.env["HMAC_SECRET"];
    }
  });

  it("does not throw when all required vars are present", () => {
    process.env["DB_ENCRYPTION_KEY"] = "enc-key-value";
    process.env["HMAC_SECRET"]       = "hmac-key-value";
    expect(() => loadSecrets()).not.toThrow();
  });

  it("throws an Error listing ALL missing vars when none are set", () => {
    try {
      loadSecrets();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("DB_ENCRYPTION_KEY");
      expect(msg).toContain("HMAC_SECRET");
    }
  });

  it("throws an Error listing ONLY the missing var when one is absent", () => {
    process.env["DB_ENCRYPTION_KEY"] = "enc-key-value";
    // HMAC_SECRET deliberately absent
    try {
      loadSecrets();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("HMAC_SECRET");
      expect(msg).not.toContain("DB_ENCRYPTION_KEY");
    }
  });
});
