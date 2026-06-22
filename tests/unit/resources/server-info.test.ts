/**
 * Unit tests for src/resources/server-info.ts
 *
 * Covers: registerServerInfoResource — the static iso27001://server/info
 * resource that returns server version, control counts, and DB statistics.
 * No authentication required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const MOCK_COUNTS = {
  c2022: 93, c2013: 114, new22: 11, clauses: 41, mappings: 125,
  assessments: 2, risks: 5, policies: 3, audits: 1,
  evidence: 7, api_keys: 2,
};

const mockStmt = { get: vi.fn(() => MOCK_COUNTS), all: vi.fn(() => []) };
const mockDb = { prepare: vi.fn(() => mockStmt) };

vi.mock("../../../src/db/connection.js", () => ({
  getDb:           vi.fn(() => mockDb),
  getUptimeSeconds: vi.fn(() => 42),
}));

vi.mock("../../../src/security/secrets.js", () => ({
  getEnv: vi.fn((key: string, fallback: string) => {
    if (key === "DB_PATH")        return "./test.db";
    if (key === "RATE_LIMIT_RPM") return "300";
    return fallback;
  }),
}));

// Static resource: server.resource("name", "uri", meta, callback)
// The mock captures the 4th arg as readFn; 2nd arg is a string URI (no _list).
type ReadFn = (uri: URL, extra: unknown) => unknown;
interface Captured { name: string; readFn: ReadFn }
const captured: Captured[] = [];

const mockServer = {
  resource: vi.fn((name: string, _uriOrTpl: unknown, _meta: unknown, readFn: ReadFn) => {
    captured.push({ name, readFn });
  }),
};

import { registerServerInfoResource } from "../../../src/resources/server-info.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockStmt.get.mockReturnValue(MOCK_COUNTS);
  registerServerInfoResource(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

// ── Registration ──────────────────────────────────────────────

describe("registerServerInfoResource", () => {
  it("registers one resource", () => {
    expect(captured).toHaveLength(1);
  });

  it("registers iso27001-server-info", () => {
    expect(getResource("iso27001-server-info")).toBeDefined();
  });
});

// ── Read callback ─────────────────────────────────────────────

describe("iso27001-server-info read callback", () => {
  it("returns server info JSON with control data counts", () => {
    const res = getResource("iso27001-server-info").readFn(
      new URL("iso27001://server/info"),
      {},
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.mcp_protocol_version).toBe("2024-11-05");
    expect(data.control_data.version_2022_count).toBe(93);
    expect(data.control_data.version_2013_count).toBe(114);
    expect(data.control_data.clause_count).toBe(41);
  });

  it("returns database statistics from DB query", () => {
    const res = getResource("iso27001-server-info").readFn(
      new URL("iso27001://server/info"),
      {},
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.database.assessment_count).toBe(2);
    expect(data.database.risk_count).toBe(5);
    expect(data.database.policy_count).toBe(3);
    expect(data.database.encrypted).toBe(true);
    expect(data.database.path).toBe("./test.db");
  });

  it("returns uptime_seconds and rate_limit_rpm", () => {
    const res = getResource("iso27001-server-info").readFn(
      new URL("iso27001://server/info"),
      {},
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.uptime_seconds).toBe(42);
    expect(data.rate_limit_rpm).toBe(300);
  });

  it("uses iso27001://server/info as the resource URI", () => {
    const res = getResource("iso27001-server-info").readFn(
      new URL("iso27001://server/info"),
      {},
    ) as { contents: Array<{ uri: string }> };
    expect(res.contents[0].uri).toBe("iso27001://server/info");
  });

  it("returns a version string", () => {
    const res = getResource("iso27001-server-info").readFn(
      new URL("iso27001://server/info"),
      {},
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(typeof data.version).toBe("string");
    expect(data.version.length).toBeGreaterThan(0);
  });

  it("falls back to package.json require when npm_package_version is not set", () => {
    const orig = process.env.npm_package_version;
    try {
      delete process.env.npm_package_version;
      const res = getResource("iso27001-server-info").readFn(
        new URL("iso27001://server/info"),
        {},
      ) as { contents: Array<{ text: string }> };
      const data = JSON.parse(res.contents[0].text);
      // Either returns from require("../../package.json") or falls back to "2.0.0"
      expect(typeof data.version).toBe("string");
      expect(data.version.length).toBeGreaterThan(0);
    } finally {
      if (orig !== undefined) process.env.npm_package_version = orig;
    }
  });
});
