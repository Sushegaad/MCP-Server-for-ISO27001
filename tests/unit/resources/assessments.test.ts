/**
 * Unit tests for src/resources/assessments.ts
 *
 * Covers: registerAssessmentResources — list and read callbacks for
 * iso27001-assessment, iso27001-soa, and iso27001-audit (with nested
 * findings and corrective actions).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

// Multi-stmt mock: different stmts for different SQL patterns
const stmts: Record<string, { get: ReturnType<typeof vi.fn>; all: ReturnType<typeof vi.fn> }> = {
  assessments:   { get: vi.fn(), all: vi.fn(() => []) },
  control_stats: { get: vi.fn(), all: vi.fn(() => []) },
  soa:           { get: vi.fn(), all: vi.fn(() => []) },
  soa_entries:   { get: vi.fn(), all: vi.fn(() => []) },
  soa_list:      { get: vi.fn(), all: vi.fn(() => []) },
  audits:        { get: vi.fn(), all: vi.fn(() => []) },
  findings:      { get: vi.fn(), all: vi.fn(() => []) },
  corrective:    { get: vi.fn(), all: vi.fn(() => []) },
};

const mockDb = {
  prepare: vi.fn((sql: string) => {
    if (sql.includes("control_statuses"))   return stmts.control_stats;
    if (sql.includes("soa_entries"))        return stmts.soa_entries;
    if (sql.includes("soa s") && sql.includes("JOIN")) return stmts.soa_list;
    if (sql.includes("FROM soa "))          return stmts.soa;
    if (sql.includes("findings"))           return stmts.findings;
    if (sql.includes("corrective_actions")) return stmts.corrective;
    if (sql.includes("audits"))             return stmts.audits;
    return stmts.assessments;
  }),
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

import { registerAssessmentResources } from "../../../src/resources/assessments.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  for (const s of Object.values(stmts)) {
    s.get.mockReturnValue(undefined);
    s.all.mockReturnValue([]);
  }
  mockDb.prepare.mockImplementation((sql: string) => {
    if (sql.includes("control_statuses"))   return stmts.control_stats;
    if (sql.includes("soa_entries"))        return stmts.soa_entries;
    if (sql.includes("soa s") && sql.includes("JOIN")) return stmts.soa_list;
    if (sql.includes("FROM soa "))          return stmts.soa;
    if (sql.includes("findings"))           return stmts.findings;
    if (sql.includes("corrective_actions")) return stmts.corrective;
    if (sql.includes("audits"))             return stmts.audits;
    return stmts.assessments;
  });
  registerAssessmentResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

// ── Sample data ───────────────────────────────────────────────

const ASSESSMENT_ROW = {
  id: "ga-1", name: "2025 Gap Assessment",
  scope: "All cloud systems", isms_version: "2022", status: "active",
  themes_in_scope: null, exclude_controls: '["5.7"]',
  exclude_justification: "Not applicable",
  archived_at: null, archived_by: null, archive_reason: null,
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

const SOA_ROW = {
  id: "soa-1", assessment_id: "ga-1", isms_version: "2022",
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-06-01T00:00:00Z",
};

const SOA_ENTRY = {
  id: "se-1", soa_id: "soa-1", control_id: "5.1",
  included: 1, justification: "Core control", status: "implemented",
  evidence_count: 3, responsible_party: "CISO",
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

const AUDIT_ROW = {
  id: "aud-1", name: "Internal Audit 2025", scope: "Annex A controls",
  auditor: "Jane Doe", planned_date: "2025-06-01",
  actual_date: "2025-06-03", status: "completed",
  controls_in_scope: '["5.1","5.2"]', clauses_in_scope: '["4","5"]',
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-06-03T00:00:00Z",
};

const FINDING_ROW = {
  id: "f-1", audit_id: "aud-1", type: "nc",
  clause_or_control: "5.1", description: "Policy not approved",
  objective_evidence: "No signature on policy doc",
  severity: "minor",
  created_at: "2025-06-01T00:00:00Z", updated_at: "2025-06-01T00:00:00Z",
};

const CORRECTIVE_ACTION = {
  id: "ca-1", finding_id: "f-1",
  description: "Obtain CEO approval", owner: "CISO",
  due_date: "2025-07-01", status: "in_progress",
  root_cause: "Process gap", effectiveness_verified: 0,
  evidence_ref: null,
  created_at: "2025-06-01T00:00:00Z", updated_at: "2025-06-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerAssessmentResources", () => {
  it("registers three resources", () => {
    expect(captured).toHaveLength(3);
  });

  it("registers iso27001-assessment with list callback", () => {
    expect(getResource("iso27001-assessment").listFn).toBeDefined();
  });

  it("registers iso27001-soa with list callback", () => {
    expect(getResource("iso27001-soa").listFn).toBeDefined();
  });

  it("registers iso27001-audit with list callback", () => {
    expect(getResource("iso27001-audit").listFn).toBeDefined();
  });
});

// ── iso27001-assessment list ──────────────────────────────────

describe("iso27001-assessment list callback", () => {
  it("maps assessment rows to resource entries", () => {
    stmts.assessments.all.mockReturnValue([
      { id: "ga-1", name: "2025 Gap", isms_version: "2022", status: "active", created_at: "2025-01-01T00:00:00Z" },
    ]);
    const { resources } = getResource("iso27001-assessment").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://assessment/ga-1");
    expect((resources[0] as { name: string }).name).toBe("2025 Gap");
  });
});

// ── iso27001-assessment read ──────────────────────────────────

describe("iso27001-assessment read callback", () => {
  it("returns assessment JSON with control_status_summary", async () => {
    stmts.assessments.get.mockReturnValue(ASSESSMENT_ROW);
    stmts.control_stats.all.mockReturnValue([
      { status: "implemented", count: 40 },
      { status: "partial", count: 10 },
    ]);
    const res = await getResource("iso27001-assessment").readFn(
      new URL("iso27001://assessment/ga-1"),
      { assessment_id: "ga-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.id).toBe("ga-1");
    expect(data.control_status_summary.implemented).toBe(40);
    expect(data.control_status_summary.partial).toBe(10);
    expect(data.exclude_controls).toEqual(["5.7"]);
  });

  it("calls assertResourceAuth", async () => {
    stmts.assessments.get.mockReturnValue(ASSESSMENT_ROW);
    await getResource("iso27001-assessment").readFn(
      new URL("iso27001://assessment/ga-1"),
      { assessment_id: "ga-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("throws when assessment is not found", async () => {
    stmts.assessments.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-assessment").readFn(
        new URL("iso27001://assessment/missing"),
        { assessment_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Assessment not found");
  });
});

// ── iso27001-soa list ─────────────────────────────────────────

describe("iso27001-soa list callback", () => {
  it("maps SoA rows to resource entries with assessment name", () => {
    stmts.soa_list.all.mockReturnValue([
      {
        id: "soa-1", assessment_id: "ga-1", isms_version: "2022",
        created_at: "2025-01-01T00:00:00Z", assessment_name: "2025 Gap",
      },
    ]);
    const { resources } = getResource("iso27001-soa").listFn!();
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://soa/soa-1");
    expect((resources[0] as { name: string }).name).toContain("2025 Gap");
  });
});

// ── iso27001-soa read ─────────────────────────────────────────

describe("iso27001-soa read callback", () => {
  it("returns SoA JSON with entries and boolean included", async () => {
    stmts.soa.get.mockReturnValue(SOA_ROW);
    stmts.soa_entries.all.mockReturnValue([SOA_ENTRY]);
    const res = await getResource("iso27001-soa").readFn(
      new URL("iso27001://soa/soa-1"),
      { soa_id: "soa-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.id).toBe("soa-1");
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].included).toBe(true);  // 1 → true
    expect(data.entries[0].control_id).toBe("5.1");
  });

  it("converts included=0 to false", async () => {
    stmts.soa.get.mockReturnValue(SOA_ROW);
    stmts.soa_entries.all.mockReturnValue([{ ...SOA_ENTRY, included: 0 }]);
    const res = await getResource("iso27001-soa").readFn(
      new URL("iso27001://soa/soa-1"),
      { soa_id: "soa-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.entries[0].included).toBe(false);
  });

  it("throws when SoA is not found", async () => {
    stmts.soa.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-soa").readFn(
        new URL("iso27001://soa/missing"),
        { soa_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("SoA not found");
  });
});

// ── iso27001-audit list ───────────────────────────────────────

describe("iso27001-audit list callback", () => {
  it("maps audit rows to resource entries", () => {
    stmts.audits.all.mockReturnValue([
      {
        id: "aud-1", name: "Internal Audit 2025", auditor: "Jane",
        status: "completed", planned_date: "2025-06-01", actual_date: "2025-06-03",
      },
    ]);
    const { resources } = getResource("iso27001-audit").listFn!();
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://audit/aud-1");
    expect((resources[0] as { description: string }).description).toContain("actual");
  });

  it("omits actual date from description when null", () => {
    stmts.audits.all.mockReturnValue([
      {
        id: "aud-2", name: "Planned Audit", auditor: "Bob",
        status: "planned", planned_date: "2025-12-01", actual_date: null,
      },
    ]);
    const { resources } = getResource("iso27001-audit").listFn!();
    expect((resources[0] as { description: string }).description).not.toContain("actual");
  });
});

// ── iso27001-audit read ───────────────────────────────────────

describe("iso27001-audit read callback", () => {
  it("returns audit JSON with nested findings and corrective actions", async () => {
    stmts.audits.get.mockReturnValue(AUDIT_ROW);
    stmts.findings.all.mockReturnValue([FINDING_ROW]);
    stmts.corrective.all.mockReturnValue([CORRECTIVE_ACTION]);
    const res = await getResource("iso27001-audit").readFn(
      new URL("iso27001://audit/aud-1"),
      { audit_id: "aud-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.id).toBe("aud-1");
    expect(data.controls_in_scope).toEqual(["5.1", "5.2"]);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].type).toBe("nc");
    expect(data.findings[0].corrective_actions).toHaveLength(1);
    expect(data.findings[0].corrective_actions[0].effectiveness_verified).toBe(false);
  });

  it("returns empty findings array when audit has no findings", async () => {
    stmts.audits.get.mockReturnValue(AUDIT_ROW);
    stmts.findings.all.mockReturnValue([]);
    const res = await getResource("iso27001-audit").readFn(
      new URL("iso27001://audit/aud-1"),
      { audit_id: "aud-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.findings).toEqual([]);
    // corrective_actions not queried when no findings
    expect(stmts.corrective.all).not.toHaveBeenCalled();
  });

  it("throws when audit is not found", async () => {
    stmts.audits.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-audit").readFn(
        new URL("iso27001://audit/missing"),
        { audit_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Audit not found");
  });

  it("calls assertResourceAuth", async () => {
    stmts.audits.get.mockReturnValue(AUDIT_ROW);
    stmts.findings.all.mockReturnValue([]);
    await getResource("iso27001-audit").readFn(
      new URL("iso27001://audit/aud-1"),
      { audit_id: "aud-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });
});
