/**
 * Unit tests for src/auth/api-key.ts
 *
 * Tests: generateKey, validateKey, parseExpiresFlag
 * DB is fully mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

// ── Mock the DB module ────────────────────────────────────────────────────

const mockRun = vi.fn(() => ({ changes: 1 }));
const mockGet = vi.fn<() => { key_hash: string } | undefined>(() => undefined);
const mockPrepare = vi.fn(() => ({ run: mockRun, get: mockGet }));
const mockDb = { prepare: mockPrepare };

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Import SUT after mock is registered ──────────────────────────────────

import {
  generateKey,
  validateKey,
  parseExpiresFlag,
} from "../../../src/auth/api-key.js";
import { McpError } from "../../../src/types/errors.js";

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  process.env["HMAC_SECRET"]       = "test-secret-32-bytes-long-xxxx";
  process.env["DB_ENCRYPTION_KEY"] = "testkey";
  vi.clearAllMocks();
  mockPrepare.mockReturnValue({ run: mockRun, get: mockGet });
  mockGet.mockReturnValue(undefined);
});

afterEach(() => {
  delete process.env["HMAC_SECRET"];
  delete process.env["DB_ENCRYPTION_KEY"];
});

// ── generateKey ──────────────────────────────────────────────────────────

describe("generateKey", () => {
  it('returned key starts with "iso27001_"', () => {
    const key = generateKey("Alice", "analyst", null);
    expect(key.startsWith("iso27001_")).toBe(true);
  });

  it("returned key has length greater than 30 chars", () => {
    const key = generateKey("Bob", "viewer", null);
    expect(key.length).toBeGreaterThan(30);
  });

  it("calls db.prepare().run() to insert the key record", () => {
    generateKey("Charlie", "admin", "2027-01-01");
    expect(mockPrepare).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });
});

// ── validateKey ──────────────────────────────────────────────────────────

describe("validateKey", () => {
  it('throws McpError with AUTH_MISSING for an empty string', () => {
    expect(() => validateKey("")).toThrow(McpError);
    try {
      validateKey("");
    } catch (err) {
      expect((err as McpError).error_code).toBe("AUTH_MISSING");
    }
  });

  it('throws McpError with AUTH_INVALID when key is not found in DB', () => {
    mockGet.mockReturnValue(undefined);
    expect(() => validateKey("iso27001_invalid")).toThrow(McpError);
    try {
      validateKey("iso27001_invalid");
    } catch (err) {
      expect((err as McpError).error_code).toBe("AUTH_INVALID");
    }
  });

  it("succeeds and returns key_hash when mock DB returns matching HMAC", () => {
    const secret  = process.env["HMAC_SECRET"]!;
    const rawKey  = "iso27001_testrawkey";
    const keyHash = createHmac("sha256", secret).update(rawKey).digest("hex");

    // Mock DB returns a row with the correct hash
    mockGet.mockReturnValue({ key_hash: keyHash });

    let result: string | undefined;
    expect(() => {
      result = validateKey(rawKey);
    }).not.toThrow();

    expect(result).toBe(keyHash);
  });
});

// ── parseExpiresFlag ──────────────────────────────────────────────────────

describe("parseExpiresFlag", () => {
  it('parses "90d" into a date string matching YYYY-MM-DD', () => {
    const result = parseExpiresFlag("90d");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses "1y" into a date one year from today', () => {
    const result   = parseExpiresFlag("1y");
    const expected = new Date();
    expected.setFullYear(expected.getFullYear() + 1);
    const expectedStr = expected.toISOString().split("T")[0];
    expect(result).toBe(expectedStr);
  });

  it('returns the value unchanged for a plain ISO date "2027-01-15"', () => {
    expect(parseExpiresFlag("2027-01-15")).toBe("2027-01-15");
  });

  it('throws an Error for an invalid value', () => {
    expect(() => parseExpiresFlag("invalid")).toThrow(Error);
  });
});
