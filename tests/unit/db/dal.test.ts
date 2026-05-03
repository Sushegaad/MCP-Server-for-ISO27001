/**
 * Unit tests for src/db/dal.ts
 *
 * Tests: today, computeEvidenceStatus, toJson, fromJson, fromJsonArray,
 *        queryAll, queryOne, execute, withTransaction
 *
 * DB is mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ───────────────────────────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
  run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
};
const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: () => unknown) => fn),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Import SUT after mock ─────────────────────────────────────────────────

import {
  today,
  computeEvidenceStatus,
  toJson,
  fromJson,
  fromJsonArray,
  queryAll,
  queryOne,
  execute,
  withTransaction,
} from "../../../src/db/dal.js";

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
  mockStmt.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 });
});

// ── today ─────────────────────────────────────────────────────────────────

describe("today", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the current date (not a fixed past date)", () => {
    const result = today();
    const parsed = new Date(result);
    expect(parsed.getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});

// ── computeEvidenceStatus ─────────────────────────────────────────────────

describe("computeEvidenceStatus", () => {
  it("returns 'current' when no expiryDate is provided", () => {
    expect(computeEvidenceStatus("2025-01-01")).toBe("current");
    expect(computeEvidenceStatus("2025-01-01", null)).toBe("current");
    expect(computeEvidenceStatus("2025-01-01", undefined)).toBe("current");
  });

  it("returns 'expired' when expiry date is in the past", () => {
    const pastDate = "2020-01-01";
    expect(computeEvidenceStatus("2019-01-01", pastDate)).toBe("expired");
  });

  it("returns 'stale' when within 30 days of expiry", () => {
    // Set expiry to 15 days from now
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    const soonStr = soon.toISOString().split("T")[0];
    expect(computeEvidenceStatus("2025-01-01", soonStr)).toBe("stale");
  });

  it("returns 'current' when expiry is far in the future", () => {
    expect(computeEvidenceStatus("2025-01-01", "2099-12-31")).toBe("current");
  });
});

// ── toJson / fromJson / fromJsonArray ─────────────────────────────────────

describe("toJson", () => {
  it("serialises a value to a JSON string", () => {
    expect(toJson({ a: 1 })).toBe('{"a":1}');
    expect(toJson([1, 2])).toBe("[1,2]");
  });

  it("returns null for undefined or null input", () => {
    expect(toJson(undefined)).toBeNull();
    expect(toJson(null)).toBeNull();
  });
});

describe("fromJson", () => {
  it("parses a JSON string and returns the typed value", () => {
    expect(fromJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for null or empty input", () => {
    expect(fromJson(null)).toBeNull();
    expect(fromJson(undefined)).toBeNull();
    expect(fromJson("")).toBeNull();
  });
});

describe("fromJsonArray", () => {
  it("parses a JSON array string", () => {
    expect(fromJsonArray<string>('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns [] for null or empty input", () => {
    expect(fromJsonArray(null)).toEqual([]);
    expect(fromJsonArray(undefined)).toEqual([]);
    expect(fromJsonArray("")).toEqual([]);
  });
});

// ── queryAll ──────────────────────────────────────────────────────────────

describe("queryAll", () => {
  it("prepares the SQL, calls all() with params, and returns typed rows", () => {
    const rows = [{ id: "1", name: "test" }];
    mockStmt.all.mockReturnValue(rows);

    const result = queryAll<{ id: string; name: string }>(
      "SELECT * FROM controls WHERE version = ?",
      ["2022"],
    );

    expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM controls WHERE version = ?");
    expect(mockStmt.all).toHaveBeenCalledWith("2022");
    expect(result).toEqual(rows);
  });

  it("works with no params (defaults to [])", () => {
    mockStmt.all.mockReturnValue([]);
    const result = queryAll("SELECT * FROM controls");
    expect(result).toEqual([]);
    expect(mockStmt.all).toHaveBeenCalledWith();
  });
});

// ── queryOne ──────────────────────────────────────────────────────────────

describe("queryOne", () => {
  it("prepares the SQL, calls get() with params, and returns typed row", () => {
    const row = { id: "uuid-1", name: "Policies for IS" };
    mockStmt.get.mockReturnValue(row);

    const result = queryOne<{ id: string; name: string }>(
      "SELECT * FROM controls WHERE id = ?",
      ["uuid-1"],
    );

    expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM controls WHERE id = ?");
    expect(result).toEqual(row);
  });

  it("returns null when the row is not found", () => {
    mockStmt.get.mockReturnValue(undefined);

    const result = queryOne("SELECT * FROM controls WHERE id = ?", ["missing"]);

    expect(result).toBeNull();
  });
});

// ── execute ───────────────────────────────────────────────────────────────

describe("execute", () => {
  it("prepares the SQL, calls run() with params, and returns RunResult", () => {
    const runResult = { changes: 1, lastInsertRowid: 42 };
    mockStmt.run.mockReturnValue(runResult);

    const result = execute("DELETE FROM risks WHERE id = ?", ["risk-1"]);

    expect(mockDb.prepare).toHaveBeenCalledWith("DELETE FROM risks WHERE id = ?");
    expect(mockStmt.run).toHaveBeenCalledWith("risk-1");
    expect(result).toEqual(runResult);
  });

  it("works with no params (defaults to [])", () => {
    mockStmt.run.mockReturnValue({ changes: 0, lastInsertRowid: 0 });
    execute("DELETE FROM risks");
    expect(mockStmt.run).toHaveBeenCalledWith();
  });
});

// ── withTransaction ───────────────────────────────────────────────────────

describe("withTransaction", () => {
  it("wraps the callback in a DB transaction and returns its value", () => {
    const callback = vi.fn(() => 42);
    mockDb.transaction.mockImplementation((fn: () => unknown) => fn);

    const result = withTransaction(callback);

    expect(mockDb.transaction).toHaveBeenCalledWith(callback);
    expect(result).toBe(42);
  });
});
