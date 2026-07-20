/**
 * Unit tests for src/tools/admin.ts
 *
 * Tests: handleQueryAuditLog, handleListApiKeys, handleRevokeApiKey
 *
 * DB and api-key modules are fully mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB module ────────────────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => [] as unknown[]),
  run: vi.fn(() => ({ changes: 1 })),
};
const mockDb = {
  prepare: vi.fn(() => mockStmt),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Mock the api-key module ───────────────────────────────────────────────

const mockListKeys  = vi.fn();
const mockRevokeKey = vi.fn();

vi.mock("../../../src/auth/api-key.js", () => ({
  listKeys:  (...args: unknown[]) => mockListKeys(...args) as unknown,
  revokeKey: (...args: unknown[]) => mockRevokeKey(...args) as unknown,
}));

// ── Import SUT after mocks are registered ────────────────────────────────

import {
  handleQueryAuditLog,
  handleListApiKeys,
  handleRevokeApiKey,
} from "../../../src/tools/admin.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.all.mockReturnValue([]);
});

// ── handleQueryAuditLog ───────────────────────────────────────────────────

describe("handleQueryAuditLog", () => {
  it("queries with no filters and default pagination", () => {
    const rows = [
      { id: "e1", tool: "list_controls", outcome: "success" },
      { id: "e2", tool: "create_risk",   outcome: "proposed" },
    ];
    mockStmt.all.mockReturnValue(rows);

    const result = handleQueryAuditLog({});

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(2);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
    expect(data.entries).toHaveLength(2);

    // No WHERE clause when no filters supplied
    const sql = mockDb.prepare.mock.calls[0][0] as unknown as string;
    expect(sql).not.toContain("WHERE");
    expect(mockStmt.all).toHaveBeenCalledWith(50, 0);
  });

  it("applies all filters and custom pagination", () => {
    mockStmt.all.mockReturnValue([]);

    const result = handleQueryAuditLog({
      start_date: "2026-01-01",
      end_date:   "2026-01-31",
      tool:       "update_risk",
      outcome:    "denied",
      role:       "viewer",
      key_hash:   "abc123",
      actor_type: "human",
      limit:      10,
      offset:     20,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(0);
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(20);

    const sql = mockDb.prepare.mock.calls[0][0] as unknown as string;
    expect(sql).toContain("timestamp >= ?");
    expect(sql).toContain("timestamp <= ?");
    expect(sql).toContain("tool = ?");
    expect(sql).toContain("outcome = ?");
    expect(sql).toContain("role = ?");
    expect(sql).toContain("key_hash = ?");
    expect(sql).toContain("actor_type = ?");
    expect(mockStmt.all).toHaveBeenCalledWith(
      "2026-01-01", "2026-01-31T23:59:59Z", "update_risk", "denied",
      "viewer", "abc123", "human", 10, 20,
    );
  });
});

// ── handleListApiKeys ─────────────────────────────────────────────────────

describe("handleListApiKeys", () => {
  it("returns the key list with a count and no hashes", () => {
    mockListKeys.mockReturnValue([
      { label: "alice", role: "admin",  status: "active" },
      { label: "bob",   role: "viewer", status: "revoked" },
    ]);

    const result = handleListApiKeys({});

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
    expect(data.keys[0].label).toBe("alice");
    expect(mockListKeys).toHaveBeenCalledOnce();
  });
});

// ── handleRevokeApiKey ────────────────────────────────────────────────────

describe("handleRevokeApiKey", () => {
  it("revokes the key by label", () => {
    const result = handleRevokeApiKey({ label: "alice" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.revoked).toBe(true);
    expect(data.label).toBe("alice");
    expect(mockRevokeKey).toHaveBeenCalledWith("alice");
  });
});
