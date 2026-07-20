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

  // 64 valid hex chars — the format required for both secrets
  const VALID_HEX_64 = "a".repeat(64);

  it("does not throw when all required vars are present and 64-hex", () => {
    process.env["DB_ENCRYPTION_KEY"] = VALID_HEX_64;
    process.env["HMAC_SECRET"]       = VALID_HEX_64;
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
    process.env["DB_ENCRYPTION_KEY"] = VALID_HEX_64;
    // HMAC_SECRET deliberately absent
    try {
      loadSecrets();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("HMAC_SECRET");
      expect(msg).not.toContain("DB_ENCRYPTION_KEY");
    }
  });

  it("rejects a non-hex value (e.g. .env.example placeholder)", () => {
    process.env["DB_ENCRYPTION_KEY"] = "replace_with_64_char_hex";
    process.env["HMAC_SECRET"]       = VALID_HEX_64;
    expect(() => loadSecrets()).toThrow(/64 hex characters/);
    try {
      loadSecrets();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("DB_ENCRYPTION_KEY");
      expect(msg).not.toContain("• HMAC_SECRET");
    }
  });

  it("rejects a too-short hex value", () => {
    process.env["DB_ENCRYPTION_KEY"] = VALID_HEX_64;
    process.env["HMAC_SECRET"]       = "abc123";
    expect(() => loadSecrets()).toThrow(/64 hex characters/);
  });

  it("rejects a 64-char value containing non-hex characters", () => {
    process.env["DB_ENCRYPTION_KEY"] = "z".repeat(64);
    process.env["HMAC_SECRET"]       = VALID_HEX_64;
    expect(() => loadSecrets()).toThrow(/64 hex characters/);
  });

  it("accepts uppercase hex", () => {
    process.env["DB_ENCRYPTION_KEY"] = "A1B2C3D4".repeat(8);
    process.env["HMAC_SECRET"]       = VALID_HEX_64.toUpperCase();
    expect(() => loadSecrets()).not.toThrow();
  });

  it("reports missing and malformed vars together in one error", () => {
    // DB_ENCRYPTION_KEY absent, HMAC_SECRET malformed
    process.env["HMAC_SECRET"] = "not-hex";
    try {
      loadSecrets();
      expect.unreachable("loadSecrets should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("DB_ENCRYPTION_KEY");
      expect(msg).toContain("HMAC_SECRET");
      expect(msg).toContain("64 hex characters");
    }
  });
});
