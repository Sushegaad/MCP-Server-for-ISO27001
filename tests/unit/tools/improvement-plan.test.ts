/**
 * Unit tests for src/tools/improvement-plan.ts
 *
 * Covers:
 *  - handleCreateImprovementOpportunity
 *  - handleUpdateImprovementOpportunity (forward-only status guard)
 *  - handleGetImprovementOpportunity
 *  - handleListImprovementOpportunities (health rating logic)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mock stubs ───────────────────────────────────

const mockStmt = {
  get:  vi.fn(),
  all:  vi.fn(() => []),
  run:  vi.fn(() => ({ changes: 1 })),
};

const mockDb = {
  prepare: vi.fn(() => mockStmt),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// SUT imports (after vi.mock)
import {
  handleCreateImprovementOpportunity,
  handleUpdateImprovementOpportunity,
  handleGetImprovementOpportunity,
  handleListImprovementOpportunities,
} from "../../../src/tools/improvement-plan.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parse(r: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

const OPP_ROW_OPEN = {
  id:          "opp-1",
  title:       "Automate patch management",
  description: "Manual patching is slow and error-prone",
  source:      "audit",
  priority:    "high",
  owner:       "IT Manager",
  target_date: "2025-09-30",
  status:      "open",
  review_id:   null,
  created_at:  "2025-01-01T00:00:00Z",
  updated_at:  "2025-01-01T00:00:00Z",
};

const OPP_ROW_IN_PROGRESS = { ...OPP_ROW_OPEN, status: "in_progress" };
const OPP_ROW_IMPLEMENTED  = { ...OPP_ROW_OPEN, status: "implemented" };
const OPP_ROW_CLOSED       = { ...OPP_ROW_OPEN, status: "closed" };

const EMPTY_STATS = { open: 0, in_progress: 0, implemented: 0, closed: 0, overdue: 0 };

// ── Tests ─────────────────────────────────────────────────────

describe("handleCreateImprovementOpportunity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts with defaults and returns opportunity_id", () => {
    const result = handleCreateImprovementOpportunity({
      title:       "Automate patch management",
      description: "Manual patching is slow",
      source:      "audit",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.status).toBe("open");
    expect(data.priority).toBe("medium");
    expect(typeof data.opportunity_id).toBe("string");
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it("persists optional fields when provided", () => {
    const result = handleCreateImprovementOpportunity({
      title:       "Supplier security reviews",
      description: "Quarterly reviews needed",
      source:      "management_review",
      priority:    "critical",
      owner:       "CISO",
      target_date: "2025-12-31",
      review_id:   "00000000-0000-0000-0000-000000000001",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.priority).toBe("critical");
  });
});

describe("handleUpdateImprovementOpportunity — forward-only status", () => {
  beforeEach(() => vi.clearAllMocks());

  const VALID_TRANSITIONS: Array<{ from: typeof OPP_ROW_OPEN; to: string }> = [
    { from: OPP_ROW_OPEN,        to: "in_progress" },
    { from: OPP_ROW_IN_PROGRESS, to: "implemented" },
    { from: OPP_ROW_IMPLEMENTED,  to: "closed" },
    { from: OPP_ROW_OPEN,        to: "open" },   // same-status is allowed (ordinal unchanged)
  ];

  for (const { from, to } of VALID_TRANSITIONS) {
    it(`allows ${from.status} → ${to}`, () => {
      mockStmt.get.mockReturnValueOnce(from)     // requireOpportunity
                  .mockReturnValueOnce({ ...from, status: to }); // post-update fetch

      const result = handleUpdateImprovementOpportunity({
        opportunity_id: "opp-1",
        status:         to,
      });

      expect(result.isError).toBe(false);
    });
  }

  const INVALID_TRANSITIONS: Array<{ from: typeof OPP_ROW_OPEN; to: string }> = [
    { from: OPP_ROW_IN_PROGRESS, to: "open" },
    { from: OPP_ROW_IMPLEMENTED,  to: "in_progress" },
    { from: OPP_ROW_CLOSED,      to: "implemented" },
  ];

  for (const { from, to } of INVALID_TRANSITIONS) {
    it(`rejects ${from.status} → ${to} with BUSINESS_RULE_VIOLATION`, () => {
      mockStmt.get.mockReturnValueOnce(from);

      expect(() =>
        handleUpdateImprovementOpportunity({ opportunity_id: "opp-1", status: to }),
      ).toThrow(McpError);
    });
  }

  it("throws NOT_FOUND for unknown opportunity_id", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleUpdateImprovementOpportunity({ opportunity_id: "ghost", status: "closed" }),
    ).toThrow(McpError);
  });

  it("updates non-status fields without status constraint", () => {
    mockStmt.get.mockReturnValueOnce(OPP_ROW_OPEN)
                .mockReturnValueOnce({ ...OPP_ROW_OPEN, owner: "New Owner" });

    const result = handleUpdateImprovementOpportunity({
      opportunity_id: "opp-1",
      owner:          "New Owner",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.owner).toBe("New Owner");
  });
});

describe("handleGetImprovementOpportunity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the opportunity record", () => {
    mockStmt.get.mockReturnValueOnce(OPP_ROW_OPEN);

    const result = handleGetImprovementOpportunity({ opportunity_id: "opp-1" });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.id).toBe("opp-1");
    expect(data.status).toBe("open");
  });

  it("throws NOT_FOUND for unknown opportunity_id", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetImprovementOpportunity({ opportunity_id: "ghost" })).toThrow(McpError);
  });
});

describe("handleListImprovementOpportunities — health rating", () => {
  beforeEach(() => vi.clearAllMocks());

  function withStats(stats: Partial<typeof EMPTY_STATS>) {
    const merged = { ...EMPTY_STATS, ...stats };
    // all() is called twice: opportunities list + stats query
    mockStmt.all
      .mockReturnValueOnce([OPP_ROW_OPEN])  // opportunities
      .mockReturnValueOnce([]);             // not used — stats uses get()
    // But the actual code uses .get() for stats, .all() for list
    // Looking at the implementation: opportunities use .all(), stats use .get()
    mockStmt.all.mockReset();
    mockStmt.get.mockReset();
    mockStmt.all.mockReturnValueOnce([OPP_ROW_OPEN]);
    mockStmt.get.mockReturnValueOnce(merged);
  }

  it("rates 'excellent' when active count is zero", () => {
    withStats({ open: 0, in_progress: 0, overdue: 0 });

    const result = handleListImprovementOpportunities({});
    const data   = parse(result);
    const health = data.health as Record<string, unknown>;
    expect(health.rating).toBe("excellent");
  });

  it("rates 'at_risk' when overdue > 3", () => {
    withStats({ open: 2, in_progress: 1, overdue: 4 });

    const result = handleListImprovementOpportunities({});
    const data   = parse(result);
    const health = data.health as Record<string, unknown>;
    expect(health.rating).toBe("at_risk");
  });

  it("rates 'needs_attention' when active > 10", () => {
    withStats({ open: 8, in_progress: 4, overdue: 0 });

    const result = handleListImprovementOpportunities({});
    const data   = parse(result);
    const health = data.health as Record<string, unknown>;
    expect(health.rating).toBe("needs_attention");
  });

  it("rates 'good' when active ≤ 10 and no overdue", () => {
    withStats({ open: 2, in_progress: 1, overdue: 0 });

    const result = handleListImprovementOpportunities({});
    const data   = parse(result);
    const health = data.health as Record<string, unknown>;
    expect(health.rating).toBe("good");
  });

  it("rates 'fair' when active ≤ 10 and some overdue (≤ 3)", () => {
    withStats({ open: 3, in_progress: 2, overdue: 2 });

    const result = handleListImprovementOpportunities({});
    const data   = parse(result);
    const health = data.health as Record<string, unknown>;
    expect(health.rating).toBe("fair");
  });

  it("returns opportunities array and health summary", () => {
    withStats({ open: 1 });

    const result = handleListImprovementOpportunities({});
    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(Array.isArray(data.opportunities)).toBe(true);
    expect(typeof data.health).toBe("object");
  });

  it("applies status filter", () => {
    withStats({ in_progress: 1 });

    handleListImprovementOpportunities({ status: "in_progress" });

    const sql = mockDb.prepare.mock.calls[0]?.[0] as string;
    expect(sql).toContain("status = ?");
  });
});
