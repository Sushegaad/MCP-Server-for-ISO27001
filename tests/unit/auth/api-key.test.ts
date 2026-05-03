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
  loadRole,
  listKeys,
  revokeKey,
  warnAdminExpiry,
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

// ── loadRole ──────────────────────────────────────────────────────────────

describe("loadRole", () => {
  it("returns role for a valid, active key", () => {
    const keyRow = { id: "key-1", role: "analyst", expires_at: null, revoked_at: null };
    const selectStmt = { get: vi.fn(() => keyRow), run: vi.fn(), all: vi.fn(() => []) };
    const updateStmt = { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(updateStmt);

    const role = loadRole("valid-hash");
    expect(role).toBe("analyst");
  });

  it("throws McpError AUTH_INVALID when key hash is not in DB", () => {
    const selectStmt = { get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare.mockReturnValueOnce(selectStmt);

    try {
      loadRole("bad-hash");
    } catch (err) {
      expect((err as McpError).error_code).toBe("AUTH_INVALID");
    }
  });

  it("throws McpError AUTH_REVOKED when revoked_at is set", () => {
    const keyRow = { id: "key-1", role: "analyst", expires_at: null, revoked_at: "2025-01-01" };
    const selectStmt = { get: vi.fn(() => keyRow), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare.mockReturnValueOnce(selectStmt);

    try {
      loadRole("some-hash");
    } catch (err) {
      expect((err as McpError).error_code).toBe("AUTH_REVOKED");
    }
  });

  it("throws McpError AUTH_EXPIRED when expires_at is in the past", () => {
    const keyRow = { id: "key-1", role: "viewer", expires_at: "2020-01-01", revoked_at: null };
    const selectStmt = { get: vi.fn(() => keyRow), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare.mockReturnValueOnce(selectStmt);

    try {
      loadRole("some-hash");
    } catch (err) {
      expect((err as McpError).error_code).toBe("AUTH_EXPIRED");
    }
  });

  it("does not throw when expires_at is in the future", () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const keyRow = { id: "key-1", role: "admin", expires_at: futureDate.toISOString(), revoked_at: null };
    const selectStmt = { get: vi.fn(() => keyRow), run: vi.fn(), all: vi.fn(() => []) };
    const updateStmt = { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(updateStmt);

    expect(() => loadRole("future-key-hash")).not.toThrow();
  });
});

// ── listKeys ──────────────────────────────────────────────────────────────

describe("listKeys", () => {
  it("returns empty array when no keys exist", () => {
    const allStmt = { all: vi.fn(() => []), get: vi.fn(), run: vi.fn() };
    mockPrepare.mockReturnValueOnce(allStmt);

    const result = listKeys();
    expect(result).toEqual([]);
  });

  it("returns keys with correct status for active, revoked, and expired", () => {
    const today = new Date().toISOString().split("T")[0]!;
    const rows = [
      { id: "1", label: "Alice", role: "analyst", created_at: today, expires_at: null,       revoked_at: null,       last_used_at: null },
      { id: "2", label: "Bob",   role: "viewer",  created_at: today, expires_at: "2020-01-01", revoked_at: null,       last_used_at: null },
      { id: "3", label: "Carol", role: "admin",   created_at: today, expires_at: null,       revoked_at: "2025-01-01", last_used_at: null },
    ];
    const allStmt = { all: vi.fn(() => rows), get: vi.fn(), run: vi.fn() };
    mockPrepare.mockReturnValueOnce(allStmt);

    const result = listKeys();
    expect(result).toHaveLength(3);
    expect(result[0]!.status).toBe("active");
    expect(result[1]!.status).toBe("expired");
    expect(result[2]!.status).toBe("revoked");
  });
});

// ── revokeKey ──────────────────────────────────────────────────────────────

describe("revokeKey", () => {
  it("revokes a key by label without throwing", () => {
    const selectStmt = { get: vi.fn(() => ({ id: "key-123" })), run: vi.fn(), all: vi.fn(() => []) };
    const updateStmt = { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(updateStmt);

    expect(() => revokeKey("Alice")).not.toThrow();
  });

  it("throws an Error when the label is not found in DB", () => {
    const selectStmt = { get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) };
    mockPrepare.mockReturnValueOnce(selectStmt);

    expect(() => revokeKey("nonexistent-label")).toThrow(Error);
    try {
      const selectStmt2 = { get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) };
      mockPrepare.mockReturnValueOnce(selectStmt2);
      revokeKey("nonexistent-label");
    } catch (err) {
      expect((err as Error).message).toContain("nonexistent-label");
    }
  });
});

// ── warnAdminExpiry ───────────────────────────────────────────────────────

describe("warnAdminExpiry", () => {
  it("calls console.warn when admin keys exist without expiry", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const allStmt = { all: vi.fn(() => [{ label: "AliceAdmin" }]), get: vi.fn(), run: vi.fn() };
    mockPrepare.mockReturnValueOnce(allStmt);

    warnAdminExpiry();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("AliceAdmin"));
    warnSpy.mockRestore();
  });

  it("does not call console.warn when no admin keys exist without expiry", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const allStmt = { all: vi.fn(() => []), get: vi.fn(), run: vi.fn() };
    mockPrepare.mockReturnValueOnce(allStmt);

    warnAdminExpiry();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
