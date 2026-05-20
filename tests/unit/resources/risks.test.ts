/**
 * Unit tests for src/resources/risks.ts
 *
 * Covers: registerRiskResources — list and read callbacks for
 * iso27001-risk with nested treatments.
 * Requires viewer auth (assertResourceAuth mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockStmtRisk       = { get: vi.fn(), all: vi.fn(() => []) };
const mockStmtTreatments = { get: vi.fn(), all: vi.fn(() => []) };

const mockDb = {
  prepare: vi.fn((sql: string) =>
    sql.includes("risk_treatments") ? mockStmtTreatments : mockStmtRisk,
  ),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../src/db/dal.js", () => ({
  fromJsonArray: vi.fn((raw: string | null) =>
    raw ? (JSON.parse(raw) as unknown[]) : [],
  ),
}));

const mockAssertResourceAuth = vi.fn();
vi.mock("../../../src/resources/resource-auth.js", () => ({
  assertResourceAuth: (...args: unknown[]) => mockAssertResourceAuth(...args),
}));

type ListFn = () => { resources: unknown[] };
type ReadFn = (uri: URL, vars: Record<string, string>, extra: unknown) => Promise<unknown>;
interface Captured { name: string; listFn?: ListFn; readFn: ReadFn }
const captured: Captured[] = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  ResourceTemplate: class {
    _list?: ListFn;
    constructor(public uriTemplate: string, opts: { list?: ListFn }) {
      this._list = opts.list;
    }
  },
}));

const mockServer = {
  resource: vi.fn((name: string, tpl: { _list?: ListFn }, _meta: unknown, readFn: ReadFn) => {
    captured.push({ name, listFn: tpl._list, readFn });
  }),
};

import { registerRiskResources } from "../../../src/resources/risks.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockDb.prepare.mockImplementation((sql: string) =>
    sql.includes("risk_treatments") ? mockStmtTreatments : mockStmtRisk,
  );
  mockStmtRisk.all.mockReturnValue([]);
  mockStmtRisk.get.mockReturnValue(undefined);
  mockStmtTreatments.all.mockReturnValue([]);
  registerRiskResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const RISK_ROW = {
  id: "risk-1", asset: "Customer Database",
  threat: "Ransomware attack", vulnerability: "Unpatched systems",
  likelihood: 3, impact: 4, risk_score: 12, risk_level: "High",
  owner: "IT Manager", status: "open",
  related_controls: '["8.8","8.32"]',
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

const TREATMENT_ROW = {
  id: "rt-1", risk_id: "risk-1", treatment_type: "mitigate",
  description: "Apply patches", owner: "IT Manager",
  due_date: "2025-06-01", controls: '["8.8"]',
  status: "in_progress",
  residual_likelihood: 2, residual_impact: 3,
  residual_risk_score: 6, residual_risk_level: "Medium",
  evidence_ref: null,
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerRiskResources", () => {
  it("registers one resource", () => {
    expect(captured).toHaveLength(1);
  });

  it("registers iso27001-risk with a list callback", () => {
    expect(getResource("iso27001-risk").listFn).toBeDefined();
  });
});

// ── iso27001-risk list ────────────────────────────────────────

describe("iso27001-risk list callback", () => {
  it("returns empty resources when no risks exist", () => {
    mockStmtRisk.all.mockReturnValue([]);
    const { resources } = getResource("iso27001-risk").listFn!();
    expect(resources).toHaveLength(0);
  });

  it("maps risk rows to resource entries", () => {
    mockStmtRisk.all.mockReturnValue([
      {
        id: "risk-1", asset: "Database", threat: "Ransomware",
        risk_score: 12, risk_level: "High", status: "open", owner: "IT",
      },
    ]);
    const { resources } = getResource("iso27001-risk").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://risk/risk-1");
    expect((resources[0] as { name: string }).name).toContain("[High]");
    expect((resources[0] as { name: string }).name).toContain("Database");
    expect((resources[0] as { mimeType: string }).mimeType).toBe("application/json");
  });

  it("includes owner in description when present", () => {
    mockStmtRisk.all.mockReturnValue([
      {
        id: "r1", asset: "DB", threat: "Attack",
        risk_score: 5, risk_level: "Medium", status: "open", owner: "Alice",
      },
    ]);
    const { resources } = getResource("iso27001-risk").listFn!();
    expect((resources[0] as { description: string }).description).toContain("Alice");
  });

  it("omits owner from description when null", () => {
    mockStmtRisk.all.mockReturnValue([
      {
        id: "r1", asset: "DB", threat: "Attack",
        risk_score: 5, risk_level: "Medium", status: "open", owner: null,
      },
    ]);
    const { resources } = getResource("iso27001-risk").listFn!();
    expect((resources[0] as { description: string }).description).not.toContain("owner");
  });
});

// ── iso27001-risk read ────────────────────────────────────────

describe("iso27001-risk read callback", () => {
  it("calls assertResourceAuth", async () => {
    mockStmtRisk.get.mockReturnValue(RISK_ROW);
    mockStmtTreatments.all.mockReturnValue([]);
    await getResource("iso27001-risk").readFn(
      new URL("iso27001://risk/risk-1"),
      { risk_id: "risk-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns JSON with risk data and empty treatments array", async () => {
    mockStmtRisk.get.mockReturnValue(RISK_ROW);
    mockStmtTreatments.all.mockReturnValue([]);
    const res = await getResource("iso27001-risk").readFn(
      new URL("iso27001://risk/risk-1"),
      { risk_id: "risk-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.id).toBe("risk-1");
    expect(data.asset).toBe("Customer Database");
    expect(data.risk_level).toBe("High");
    expect(data.related_controls).toEqual(["8.8", "8.32"]);
    expect(data.treatments).toEqual([]);
  });

  it("nests treatments with controls parsed from JSON", async () => {
    mockStmtRisk.get.mockReturnValue(RISK_ROW);
    mockStmtTreatments.all.mockReturnValue([TREATMENT_ROW]);
    const res = await getResource("iso27001-risk").readFn(
      new URL("iso27001://risk/risk-1"),
      { risk_id: "risk-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.treatments).toHaveLength(1);
    expect(data.treatments[0].treatment_type).toBe("mitigate");
    expect(data.treatments[0].controls).toEqual(["8.8"]);
    expect(data.treatments[0].residual_risk_level).toBe("Medium");
  });

  it("throws when risk is not found", async () => {
    mockStmtRisk.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-risk").readFn(
        new URL("iso27001://risk/missing"),
        { risk_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Risk not found");
  });
});
