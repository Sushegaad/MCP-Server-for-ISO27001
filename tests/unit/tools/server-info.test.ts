/**
 * Unit tests for src/tools/server-info.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mock stubs ───────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
  run: vi.fn(() => ({ changes: 1 })),
};

const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: () => unknown) => fn),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
  getUptimeSeconds: vi.fn(() => 42),
}));

vi.mock("../../../src/security/secrets.js", () => ({
  getEnv: vi.fn((key: string, defaultVal: string) => defaultVal),
}));

// ── SUT imports (after vi.mock) ───────────────────────────────

import { handleGetServerInfo } from "../../../src/tools/server-info.js";
import { getUptimeSeconds } from "../../../src/db/connection.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const DB_COUNTS_ROW = {
  c2022:       93,
  c2013:       114,
  new22:       11,
  clauses:     28,
  mappings:    200,
  assessments: 3,
  risks:       12,
  policies:    5,
  audits:      2,
  evidence:    8,
  api_keys:    1,
};

// ── Tests ─────────────────────────────────────────────────────

describe("handleGetServerInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockStmt.get.mockReturnValue(DB_COUNTS_ROW);
  });

  it("returns isError: false", () => {
    const result = handleGetServerInfo();
    expect(result.isError).toBe(false);
  });

  it("response contains version, mcp_protocol_version, control_data, and database fields", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);

    expect(typeof data.version).toBe("string");
    expect(data.mcp_protocol_version).toBe("2024-11-05");
    expect(data.control_data).toBeDefined();
    expect(data.database).toBeDefined();
  });

  it("database.encrypted is true", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);
    expect(data.database.encrypted).toBe(true);
  });

  it("control_data.version_2022_count matches mocked DB value (93)", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);
    expect(data.control_data.version_2022_count).toBe(93);
  });

  it("control_data.version_2013_count matches mocked DB value (114)", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);
    expect(data.control_data.version_2013_count).toBe(114);
  });

  it("uptime_seconds equals the mocked value (42)", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);
    expect(data.uptime_seconds).toBe(42);
    expect(getUptimeSeconds).toHaveBeenCalled();
  });

  it("database counts come from the mocked query result", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);

    expect(data.database.assessment_count).toBe(3);
    expect(data.database.risk_count).toBe(12);
    expect(data.database.policy_count).toBe(5);
    expect(data.database.audit_count).toBe(2);
    expect(data.database.evidence_count).toBe(8);
    expect(data.database.api_key_count).toBe(1);
  });

  it("control_data includes correct new_in_2022, clause, and mapping counts", () => {
    const result = handleGetServerInfo();
    const data = parseResult(result);

    expect(data.control_data.new_in_2022_count).toBe(11);
    expect(data.control_data.clause_count).toBe(28);
    expect(data.control_data.mapping_count).toBe(200);
  });

  it("returns a string content block containing valid JSON", () => {
    const result = handleGetServerInfo();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
