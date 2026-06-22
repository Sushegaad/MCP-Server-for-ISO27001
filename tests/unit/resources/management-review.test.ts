/**
 * Unit tests for src/resources/management-review.ts
 *
 * Covers: registerManagementReviewResources
 *   - Registration count and callback shape
 *   - iso27001-management-review list: empty, with/without completed_at
 *   - iso27001-management-review read: auth, nested inputs+outputs,
 *     fromJsonArray for reviewers, not-found error
 *   - iso27001-improvement-plan singleton: auth, all 5 health rating
 *     branches (at_risk / needs_attention / excellent / good / fair),
 *     stats propagation, opportunity list passthrough
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const stmts = {
  reviews_list:  { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  review_read:   { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  inputs:        { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  outputs:       { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  opportunities: { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  stats:         { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
};

const mockDb = {
  prepare: vi.fn((sql: string) => {
    if (sql.includes("review_inputs"))                                    return stmts.inputs;
    if (sql.includes("review_outputs"))                                   return stmts.outputs;
    if (sql.includes("improvement_opportunities") && sql.includes("SUM")) return stmts.stats;
    if (sql.includes("improvement_opportunities"))                         return stmts.opportunities;
    if (sql.includes("SELECT *"))                                         return stmts.review_read;
    return stmts.reviews_list;
  }),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../src/db/dal.js", () => ({
  fromJsonArray: vi.fn((raw: string | null) =>
    raw ? (JSON.parse(raw) as unknown[]) : [],
  ),
  PRIORITY_SORT_SQL:
    "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
}));

const mockAssertResourceAuth = vi.fn();
vi.mock("../../../src/resources/resource-auth.js", () => ({
  assertResourceAuth: (...args: unknown[]) => mockAssertResourceAuth(...args),
}));

type ListFn  = () => { resources: unknown[] };
type ReadFn  = (uri: URL, vars: Record<string, string>, extra: unknown) => unknown;
interface Captured { name: string; listFn?: ListFn; readFn: ReadFn }
const captured: Captured[] = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  ResourceTemplate: class {
    _list?: ListFn;
    constructor(public uriTemplate: string, opts: { list?: ListFn | undefined }) {
      this._list = opts.list ?? undefined;
    }
  },
}));

const mockServer = {
  resource: vi.fn(
    (name: string, tpl: { _list?: ListFn }, _meta: unknown, readFn: ReadFn) => {
      captured.push({ name, listFn: tpl._list, readFn });
    },
  ),
};

import { registerManagementReviewResources } from "../../../src/resources/management-review.ts";

// ── Setup ─────────────────────────────────────────────────────

const DEFAULT_STATS = { open: 0, in_progress: 0, implemented: 0, closed: 0, overdue: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  for (const s of Object.values(stmts)) {
    s.get.mockReturnValue(undefined);
    s.all.mockReturnValue([]);
  }
  stmts.stats.get.mockReturnValue(DEFAULT_STATS);
  mockDb.prepare.mockImplementation((sql: string) => {
    if (sql.includes("review_inputs"))                                    return stmts.inputs;
    if (sql.includes("review_outputs"))                                   return stmts.outputs;
    if (sql.includes("improvement_opportunities") && sql.includes("SUM")) return stmts.stats;
    if (sql.includes("improvement_opportunities"))                         return stmts.opportunities;
    if (sql.includes("SELECT *"))                                         return stmts.review_read;
    return stmts.reviews_list;
  });
  registerManagementReviewResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const REVIEW_ROW = {
  id:           "mr-1",
  title:        "Q1 2025 Management Review",
  review_date:  "2025-03-31",
  reviewers:    '["Alice","Bob"]',
  scope_notes:  "Full ISMS scope",
  status:       "completed",
  completed_at: "2025-04-01T10:00:00Z",
  completed_by: "Alice",
  created_at:   "2025-03-01T00:00:00Z",
  updated_at:   "2025-04-01T10:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerManagementReviewResources", () => {
  it("registers exactly two resources", () => {
    expect(captured).toHaveLength(2);
  });

  it("registers iso27001-management-review with a list callback", () => {
    const r = getResource("iso27001-management-review");
    expect(r.listFn).toBeDefined();
  });

  it("registers iso27001-improvement-plan as a singleton (no list callback)", () => {
    const r = getResource("iso27001-improvement-plan");
    expect(r.listFn).toBeUndefined();
  });
});

// ── management-review list ────────────────────────────────────

describe("iso27001-management-review list callback", () => {
  it("returns empty resources when no reviews exist", () => {
    stmts.reviews_list.all.mockReturnValue([]);
    const result = getResource("iso27001-management-review").listFn!();
    expect(result.resources).toEqual([]);
  });

  it("maps a row to a URI and description", () => {
    stmts.reviews_list.all.mockReturnValue([{
      id: "mr-1", title: "Annual Review", review_date: "2025-01-15",
      status: "planned", completed_at: null,
    }]);
    const result = getResource("iso27001-management-review").listFn!();
    const r = result.resources[0] as { uri: string; name: string; mimeType: string };
    expect(r.uri).toBe("iso27001://management-review/mr-1");
    expect(r.name).toBe("Annual Review");
    expect(r.mimeType).toBe("application/json");
  });

  it("appends 'completed:' suffix when completed_at is present", () => {
    stmts.reviews_list.all.mockReturnValue([{
      id: "mr-2", title: "Q3 Review", review_date: "2025-09-30",
      status: "completed", completed_at: "2025-10-02",
    }]);
    const result = getResource("iso27001-management-review").listFn!();
    const r = result.resources[0] as { description: string };
    expect(r.description).toContain("completed: 2025-10-02");
  });

  it("omits completed suffix when completed_at is null", () => {
    stmts.reviews_list.all.mockReturnValue([{
      id: "mr-3", title: "Planned Review", review_date: "2025-12-01",
      status: "planned", completed_at: null,
    }]);
    const result = getResource("iso27001-management-review").listFn!();
    const r = result.resources[0] as { description: string };
    expect(r.description).not.toContain("completed");
  });

  it("maps multiple rows in order", () => {
    stmts.reviews_list.all.mockReturnValue([
      { id: "mr-a", title: "A", review_date: "2025-06-01", status: "completed", completed_at: "2025-06-02" },
      { id: "mr-b", title: "B", review_date: "2025-03-01", status: "planned",   completed_at: null },
    ]);
    const result = getResource("iso27001-management-review").listFn!();
    expect(result.resources).toHaveLength(2);
  });
});

// ── management-review read ────────────────────────────────────

describe("iso27001-management-review read callback", () => {
  it("calls assertResourceAuth with extra", () => {
    stmts.review_read.get.mockReturnValue(REVIEW_ROW);
    stmts.inputs.all.mockReturnValue([]);
    stmts.outputs.all.mockReturnValue([]);
    const uri = new URL("iso27001://management-review/mr-1");
    getResource("iso27001-management-review").readFn(uri, { review_id: "mr-1" }, MOCK_EXTRA);
    expect(mockAssertResourceAuth).toHaveBeenCalledOnce();
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns the review with reviewers as an array (via fromJsonArray)", () => {
    stmts.review_read.get.mockReturnValue(REVIEW_ROW);
    stmts.inputs.all.mockReturnValue([]);
    stmts.outputs.all.mockReturnValue([]);
    const uri = new URL("iso27001://management-review/mr-1");
    const result = getResource("iso27001-management-review").readFn(
      uri, { review_id: "mr-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text);
    expect(Array.isArray(parsed.reviewers)).toBe(true);
    expect(parsed.reviewers).toEqual(["Alice", "Bob"]);
  });

  it("nests inputs and outputs arrays in the payload", () => {
    const inputRow = {
      id: "inp-1", review_id: "mr-1", input_category: "audit_results",
      summary: "No major findings", details: null, trend: "stable",
      created_at: "2025-03-30T00:00:00Z", updated_at: "2025-03-30T00:00:00Z",
    };
    const outputRow = {
      id: "out-1", review_id: "mr-1", output_type: "resource_decision",
      decision: "Hire a security analyst", owner: "HR",
      due_date: "2025-06-30", created_at: "2025-04-01T00:00:00Z", updated_at: "2025-04-01T00:00:00Z",
    };
    stmts.review_read.get.mockReturnValue(REVIEW_ROW);
    stmts.inputs.all.mockReturnValue([inputRow]);
    stmts.outputs.all.mockReturnValue([outputRow]);

    const uri = new URL("iso27001://management-review/mr-1");
    const result = getResource("iso27001-management-review").readFn(
      uri, { review_id: "mr-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.inputs[0].input_category).toBe("audit_results");
    expect(parsed.outputs).toHaveLength(1);
    expect(parsed.outputs[0].output_type).toBe("resource_decision");
  });

  it("includes the uri in the content block", () => {
    stmts.review_read.get.mockReturnValue(REVIEW_ROW);
    stmts.inputs.all.mockReturnValue([]);
    stmts.outputs.all.mockReturnValue([]);
    const uri = new URL("iso27001://management-review/mr-1");
    const result = getResource("iso27001-management-review").readFn(
      uri, { review_id: "mr-1" }, MOCK_EXTRA,
    ) as { contents: { uri: string; mimeType: string }[] };
    expect(result.contents[0].uri).toBe("iso27001://management-review/mr-1");
    expect(result.contents[0].mimeType).toBe("application/json");
  });

  it("throws with a descriptive message when review_id is not found", () => {
    stmts.review_read.get.mockReturnValue(undefined);
    const uri = new URL("iso27001://management-review/bad-id");
    expect(() =>
      getResource("iso27001-management-review").readFn(uri, { review_id: "bad-id" }, MOCK_EXTRA),
    ).toThrow("Management review not found: 'bad-id'");
  });

  it("error message suggests using list_management_reviews", () => {
    stmts.review_read.get.mockReturnValue(undefined);
    const uri = new URL("iso27001://management-review/x");
    expect(() =>
      getResource("iso27001-management-review").readFn(uri, { review_id: "x" }, MOCK_EXTRA),
    ).toThrow("list_management_reviews");
  });
});

// ── improvement-plan health rating helper ─────────────────────

interface ImprovementStats {
  open: number; in_progress: number; implemented: number;
  closed: number; overdue: number;
}
interface PlanPayload {
  total: number;
  health: ImprovementStats & { rating: string };
  opportunities: unknown[];
}

function callPlan(statsOverride: ImprovementStats, opportunities: unknown[] = []): PlanPayload {
  stmts.stats.get.mockReturnValue(statsOverride);
  stmts.opportunities.all.mockReturnValue(opportunities);
  const uri = new URL("iso27001://improvement-plan");
  const result = getResource("iso27001-improvement-plan").readFn(
    uri, {}, MOCK_EXTRA,
  ) as { contents: { text: string }[] };
  return JSON.parse(result.contents[0].text) as PlanPayload;
}

// ── improvement-plan read ─────────────────────────────────────

describe("iso27001-improvement-plan read callback", () => {
  it("calls assertResourceAuth with extra", () => {
    const uri = new URL("iso27001://improvement-plan");
    getResource("iso27001-improvement-plan").readFn(uri, {}, MOCK_EXTRA);
    expect(mockAssertResourceAuth).toHaveBeenCalledOnce();
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns mimeType application/json", () => {
    const uri = new URL("iso27001://improvement-plan");
    const result = getResource("iso27001-improvement-plan").readFn(
      uri, {}, MOCK_EXTRA,
    ) as { contents: { mimeType: string }[] };
    expect(result.contents[0].mimeType).toBe("application/json");
  });

  // ── Health rating branches ─────────────────────────────────

  it("rates 'at_risk' when overdue > 3 (highest priority branch)", () => {
    const payload = callPlan({ open: 5, in_progress: 2, implemented: 0, closed: 0, overdue: 4 });
    expect(payload.health.rating).toBe("at_risk");
  });

  it("rates 'at_risk' at exactly overdue = 4 (boundary)", () => {
    const payload = callPlan({ open: 1, in_progress: 0, implemented: 0, closed: 0, overdue: 4 });
    expect(payload.health.rating).toBe("at_risk");
  });

  it("rates 'needs_attention' when active > 10 and overdue <= 3", () => {
    // open=8, in_progress=5 → active=13; overdue=2 (not at_risk)
    const payload = callPlan({ open: 8, in_progress: 5, implemented: 0, closed: 0, overdue: 2 });
    expect(payload.health.rating).toBe("needs_attention");
  });

  it("rates 'needs_attention' when active = 11 and overdue = 0", () => {
    const payload = callPlan({ open: 11, in_progress: 0, implemented: 0, closed: 0, overdue: 0 });
    expect(payload.health.rating).toBe("needs_attention");
  });

  it("rates 'excellent' when active === 0 (open + in_progress = 0)", () => {
    const payload = callPlan({ open: 0, in_progress: 0, implemented: 3, closed: 5, overdue: 0 });
    expect(payload.health.rating).toBe("excellent");
  });

  it("rates 'excellent' even when implemented/closed count is high", () => {
    const payload = callPlan({ open: 0, in_progress: 0, implemented: 50, closed: 20, overdue: 0 });
    expect(payload.health.rating).toBe("excellent");
  });

  it("rates 'good' when active > 0 and overdue === 0", () => {
    const payload = callPlan({ open: 3, in_progress: 2, implemented: 0, closed: 0, overdue: 0 });
    expect(payload.health.rating).toBe("good");
  });

  it("rates 'good' at active = 10 and overdue = 0 (boundary below needs_attention)", () => {
    const payload = callPlan({ open: 10, in_progress: 0, implemented: 0, closed: 0, overdue: 0 });
    expect(payload.health.rating).toBe("good");
  });

  it("rates 'fair' when active > 0 and 0 < overdue <= 3", () => {
    const payload = callPlan({ open: 2, in_progress: 1, implemented: 0, closed: 0, overdue: 1 });
    expect(payload.health.rating).toBe("fair");
  });

  it("rates 'fair' at exactly overdue = 3 (boundary below at_risk)", () => {
    const payload = callPlan({ open: 1, in_progress: 0, implemented: 0, closed: 0, overdue: 3 });
    expect(payload.health.rating).toBe("fair");
  });

  // ── Stats propagation ──────────────────────────────────────

  it("propagates all stat counters into health block", () => {
    const payload = callPlan({ open: 3, in_progress: 2, implemented: 1, closed: 4, overdue: 1 });
    expect(payload.health.open).toBe(3);
    expect(payload.health.in_progress).toBe(2);
    expect(payload.health.implemented).toBe(1);
    expect(payload.health.closed).toBe(4);
    expect(payload.health.overdue).toBe(1);
  });

  it("handles null stats fields by defaulting to 0", () => {
    // Simulate SQLite SUM returning null when table is empty
    stmts.stats.get.mockReturnValue({ open: null, in_progress: null, implemented: null, closed: null, overdue: null });
    stmts.opportunities.all.mockReturnValue([]);
    const uri = new URL("iso27001://improvement-plan");
    const result = getResource("iso27001-improvement-plan").readFn(
      uri, {}, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const payload = JSON.parse(result.contents[0].text) as PlanPayload;
    // active = 0+0 = 0 → excellent
    expect(payload.health.rating).toBe("excellent");
    expect(payload.health.open).toBe(0);
    expect(payload.health.overdue).toBe(0);
  });

  // ── Opportunity list passthrough ───────────────────────────

  it("includes the opportunity list in the payload", () => {
    const opp = {
      id: "io-1", title: "Improve MFA coverage",
      description: "Enable MFA for all admin accounts",
      source: "audit", priority: "high", owner: "CISO",
      target_date: "2025-09-01", status: "in_progress", review_id: null,
      created_at: "2025-01-01T00:00:00Z", updated_at: "2025-06-01T00:00:00Z",
    };
    const payload = callPlan({ open: 0, in_progress: 1, implemented: 0, closed: 0, overdue: 0 }, [opp]);
    expect(payload.total).toBe(1);
    expect(payload.opportunities).toHaveLength(1);
  });

  it("returns total = 0 when no opportunities exist", () => {
    const payload = callPlan(DEFAULT_STATS, []);
    expect(payload.total).toBe(0);
    expect(payload.opportunities).toEqual([]);
  });
});
