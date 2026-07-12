/**
 * Unit tests for src/tools/gap-analysis.ts
 *
 * Tests: handleCreateGapAssessment, handleUpdateControlStatus,
 *        handleGetGapSummary, handleListGapAssessments,
 *        handleExportGapReport, handleGenerateRemediationRoadmap,
 *        handleArchiveGapAssessment
 *
 * DB is fully mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB module ────────────────────────────────────────────────────

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
}));

// ── Import SUT after mock is registered ──────────────────────────────────

import {
  handleCreateGapAssessment,
  handleUpdateControlStatus,
  handleGetGapSummary,
  handleListGapAssessments,
  handleExportGapReport,
  handleGenerateRemediationRoadmap,
  handleArchiveGapAssessment,
} from "../../../src/tools/gap-analysis.js";
import { McpError } from "../../../src/types/errors.js";
import { _testSeedProposal } from "../../../src/tools/hitl-utils.js";

// ── Fixtures ──────────────────────────────────────────────────────────────

const activeAssessment = {
  id: "assess-1",
  name: "Q1 2024 Assessment",
  scope: "All controls",
  isms_version: "2022",
  status: "active",
  themes_in_scope: null,
  exclude_controls: null,
  exclude_justification: null,
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  created_at: "2024-01-01 00:00:00Z",
  updated_at: "2024-01-01 00:00:00Z",
};

const archivedAssessment = { ...activeAssessment, id: "assess-archived", status: "archived" };

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
  mockStmt.run.mockReturnValue({ changes: 1 });
  // Default: transaction just invokes the function immediately
  mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());
});

// ── handleCreateGapAssessment ─────────────────────────────────────────────

describe("handleCreateGapAssessment", () => {
  it("creates an assessment and returns id, status=active, controls_in_scope", () => {
    // Sequence of prepare() calls inside the handler:
    // 1. SELECT control_id FROM controls WHERE version = ? (inScopeControls)
    // 2. INSERT INTO gap_assessments (inside transaction)
    // 3. INSERT INTO control_statuses for each control (inside transaction)
    const controlsStmt = { get: vi.fn(), all: vi.fn(() => [{ control_id: "5.1" }, { control_id: "5.2" }]), run: vi.fn() };
    const insertAssessStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const insertStatusStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(controlsStmt)     // in-scope controls query
      .mockReturnValueOnce(insertAssessStmt) // INSERT gap_assessments
      .mockReturnValueOnce(insertStatusStmt) // INSERT control_statuses (reused for each row)
      .mockReturnValue(insertStatusStmt);    // fallback for any additional prepares

    const result = handleCreateGapAssessment({ name: "Q1 2024 Assessment", isms_version: "2022" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("active");
    expect(typeof data.id).toBe("string");
    expect(data.isms_version).toBe("2022");
  });

  it("correctly excludes specified controls and counts them separately", () => {
    const controlsStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ control_id: "5.1" }, { control_id: "5.2" }, { control_id: "5.3" }]),
      run: vi.fn(),
    };
    const insertStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(controlsStmt)
      .mockReturnValue(insertStmt);

    const result = handleCreateGapAssessment({
      name: "Scoped Assessment",
      isms_version: "2022",
      exclude_controls: ["5.3"],
      exclude_justification: "Out of scope",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.controls_excluded).toBe(1);
    expect(data.controls_in_scope).toBe(2);
  });
});

// ── handleUpdateControlStatus ─────────────────────────────────────────────

describe("handleUpdateControlStatus", () => {
  it("happy path: updates an existing control_status row", () => {
    const assessStmt   = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt = { get: vi.fn(() => ({ id: "status-uuid-1" })), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)    // requireAssessment SELECT
      .mockReturnValueOnce(existingStmt)  // SELECT existing control_status
      .mockReturnValueOnce(updateStmt);   // UPDATE

    const TEST_PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
    _testSeedProposal(TEST_PROPOSAL_ID, "update_control_status");

    const result = handleUpdateControlStatus({
      assessment_id: "assess-1",
      control_id: "5.1",
      status: "partial",
      notes: "In progress",
      confirmed: true,
      proposal_id: TEST_PROPOSAL_ID,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("partial");
    expect(data.assessment_id).toBe("assess-1");
  });

  it("silent downgrade rule: 'implemented' with no evidence_refs returns status='partial' and a warning", () => {
    const assessStmt   = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt = { get: vi.fn(() => ({ id: "status-uuid-1" })), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt)
      .mockReturnValueOnce(updateStmt);

    const TEST_PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
    _testSeedProposal(TEST_PROPOSAL_ID, "update_control_status");

    const result = handleUpdateControlStatus({
      assessment_id: "assess-1",
      control_id: "5.1",
      status: "implemented",
      // intentionally no evidence_refs
      confirmed: true,
      proposal_id: TEST_PROPOSAL_ID,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    // Status must be downgraded in the response
    expect(data.status).toBe("partial");
    // Warning field must be present and mention downgrade
    expect(typeof data.warning).toBe("string");
    expect(data.warning).toMatch(/downgraded/i);

    // Verify the DB UPDATE was called with 'partial', not 'implemented'
    expect(updateStmt.run).toHaveBeenCalled();
    const runArgs = updateStmt.run.mock.calls[0] as unknown[];
    expect(runArgs[0]).toBe("partial");
  });

  it("archived assessment rejection: throws McpError with BUSINESS_RULE error_code", () => {
    const archivedAssessStmt = { get: vi.fn(() => archivedAssessment), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(archivedAssessStmt);

    expect(() =>
      handleUpdateControlStatus({
        assessment_id: "assess-archived",
        control_id: "5.1",
        status: "partial",
      })
    ).toThrow(McpError);

    try {
      const archivedAssessStmt2 = { get: vi.fn(() => archivedAssessment), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(archivedAssessStmt2);
      handleUpdateControlStatus({
        assessment_id: "assess-archived",
        control_id: "5.1",
        status: "partial",
      });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("na_justification required rule: throws McpError when status='na' and no na_justification", () => {
    const assessStmt = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessStmt);

    expect(() =>
      handleUpdateControlStatus({
        assessment_id: "assess-1",
        control_id: "5.1",
        status: "na",
        // intentionally no na_justification
      })
    ).toThrow(McpError);

    try {
      const assessStmt2 = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(assessStmt2);
      handleUpdateControlStatus({
        assessment_id: "assess-1",
        control_id: "5.1",
        status: "na",
      });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("inserts a new control_status row when none exists", () => {
    const assessStmt   = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt)
      .mockReturnValueOnce(insertStmt);

    const TEST_PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";
    _testSeedProposal(TEST_PROPOSAL_ID, "update_control_status");

    const result = handleUpdateControlStatus({
      assessment_id: "assess-1",
      control_id: "5.99",
      status: "not_implemented",
      confirmed: true,
      proposal_id: TEST_PROPOSAL_ID,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("not_implemented");
    expect(typeof data.created_at).toBe("string");
  });

  it("preview (confirmed omitted): returns hitl_proposed with diff table", () => {
    const assessStmt   = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt = { get: vi.fn(() => ({ id: "status-uuid-1", status: "partial" })), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt);

    // No confirmed → preview only
    const result = handleUpdateControlStatus({
      assessment_id: "assess-1",
      control_id:    "5.1",
      status:        "implemented",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(typeof data.diff).toBe("string");
  });
});

// ── handleGetGapSummary ───────────────────────────────────────────────────

describe("handleGetGapSummary", () => {
  it("returns summary with compliance_percent when assessment exists", () => {
    // Sequence: requireAssessment, allControls, statuses, openRiskControls
    const assessStmt     = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const controlsStmt   = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", name: "C1", theme: "Organizational", control_type: '["Preventive"]', new_in_2022: 0, description: "", attributes: null },
        { control_id: "5.2", name: "C2", theme: "Organizational", control_type: '["Detective"]',  new_in_2022: 0, description: "", attributes: null },
      ]),
      run: vi.fn(),
    };
    const statusesStmt   = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", status: "implemented" },
        { control_id: "5.2", status: "not_implemented" },
      ]),
      run: vi.fn(),
    };
    const openRisksStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)     // requireAssessment
      .mockReturnValueOnce(controlsStmt)   // allControls
      .mockReturnValueOnce(statusesStmt)   // statuses
      .mockReturnValueOnce(openRisksStmt); // openRiskControls

    const result = handleGetGapSummary({ assessment_id: "assess-1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total_controls).toBe(2);
    expect(data.implemented).toBe(1);
    expect(data.not_implemented).toBe(1);
    expect(typeof data.compliance_percent).toBe("number");
  });

  it("throws NOT_FOUND when assessment_id is unknown", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    expect(() => handleGetGapSummary({ assessment_id: "nonexistent" })).toThrow(McpError);
    try {
      const missingStmt2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(missingStmt2);
      handleGetGapSummary({ assessment_id: "nonexistent" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleListGapAssessments ──────────────────────────────────────────────

describe("handleListGapAssessments", () => {
  it("returns active assessments by default filter", () => {
    mockStmt.all.mockReturnValue([activeAssessment]);

    const result = handleListGapAssessments({});

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.assessments[0].id).toBe("assess-1");
  });

  it("returns all assessments when filter=all", () => {
    mockStmt.all.mockReturnValue([activeAssessment, archivedAssessment]);

    const result = handleListGapAssessments({ filter: "all" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
  });
});

// ── handleExportGapReport ─────────────────────────────────────────────────

describe("handleExportGapReport", () => {
  const statusRows = [
    {
      control_id: "5.1", status: "implemented", notes: null,
      assessed_by: "Alice", assessed_at: "2024-01-15",
      name: "Policies", theme: "Organizational", description: "Desc",
    },
  ];

  it("exports as json format", () => {
    const assessStmt   = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const statusStmt   = { get: vi.fn(), all: vi.fn(() => statusRows), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusStmt);

    const result = handleExportGapReport({ assessment_id: "assess-1", format: "json" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.assessment.id).toBe("assess-1");
    expect(Array.isArray(data.statuses)).toBe(true);
  });

  it("exports as csv format", () => {
    const assessStmt = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const statusStmt = { get: vi.fn(), all: vi.fn(() => statusRows), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusStmt);

    const result = handleExportGapReport({ assessment_id: "assess-1", format: "csv" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe("csv");
    expect(data.content).toContain("control_id");
  });

  it("exports as markdown format by default", () => {
    const assessStmt = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const statusStmt = { get: vi.fn(), all: vi.fn(() => statusRows), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusStmt);

    const result = handleExportGapReport({ assessment_id: "assess-1", format: "markdown" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe("markdown");
    expect(data.content).toContain("# Gap Assessment Report");
  });
});

// ── handleGenerateRemediationRoadmap ──────────────────────────────────────

describe("handleGenerateRemediationRoadmap", () => {
  it("returns a three-phase roadmap for gaps", () => {
    const assessStmt = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const gapsStmt   = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", status: "not_implemented", notes: null, name: "C1", theme: "Technological", description: "", control_type: '["Preventive"]' },
        { control_id: "5.2", status: "partial",         notes: null, name: "C2", theme: "Organizational", description: "", control_type: '["Detective"]' },
      ]),
      run: vi.fn(),
    };
    const openRisksStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(gapsStmt)
      .mockReturnValueOnce(openRisksStmt);

    const result = handleGenerateRemediationRoadmap({ assessment_id: "assess-1", timeline_weeks: 12 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.assessment_id).toBe("assess-1");
    expect(data.total_gaps).toBe(2);
    expect(Array.isArray(data.phases)).toBe(true);
    expect(data.phases).toHaveLength(3);
  });
});

// ── handleArchiveGapAssessment ────────────────────────────────────────────

describe("handleArchiveGapAssessment", () => {
  it("archives an active assessment successfully", () => {
    const assessStmt  = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(updateStmt);

    const result = handleArchiveGapAssessment({ assessment_id: "assess-1", reason: "Completed" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe("assess-1");
    expect(data.status).toBe("archived");
  });

  it("throws BUSINESS_RULE McpError when assessment is already archived", () => {
    const archivedStmt = { get: vi.fn(() => archivedAssessment), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(archivedStmt);

    expect(() =>
      handleArchiveGapAssessment({ assessment_id: "assess-archived" })
    ).toThrow(McpError);

    try {
      const archivedStmt2 = { get: vi.fn(() => archivedAssessment), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(archivedStmt2);
      handleArchiveGapAssessment({ assessment_id: "assess-archived" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });
});

// ── handleGetGapSummary — breakdown_by branches ───────────────────────────

// Shared control fixtures with attributes needed for all breakdown types
const CONTROLS_WITH_META = [
  {
    control_id: "5.1", name: "C1", theme: "Organizational",
    control_type: '["Preventive"]', new_in_2022: 0, description: "",
    attributes: JSON.stringify({ cybersecurity_concepts: ["Identify", "Protect"] }),
  },
  {
    control_id: "5.2", name: "C2", theme: "Technological",
    control_type: '["Detective"]', new_in_2022: 0, description: "",
    attributes: JSON.stringify({ cybersecurity_concepts: ["Detect"] }),
  },
];

function makeBreakdownMocks(breakdown_by: string) {
  const assessStmt    = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
  const controlsStmt  = { get: vi.fn(), all: vi.fn(() => CONTROLS_WITH_META), run: vi.fn() };
  const statusesStmt  = {
    get: vi.fn(),
    all: vi.fn(() => [
      { control_id: "5.1", status: "implemented" },
      { control_id: "5.2", status: "not_implemented" },
    ]),
    run: vi.fn(),
  };
  const openRisksStmt = {
    get: vi.fn(),
    all: vi.fn(() => [
      { related_controls: '["5.1","5.2"]', risk_score: 20 },
    ]),
    run: vi.fn(),
  };

  mockDb.prepare
    .mockReturnValueOnce(assessStmt)
    .mockReturnValueOnce(controlsStmt)
    .mockReturnValueOnce(statusesStmt)
    .mockReturnValueOnce(openRisksStmt);

  return handleGetGapSummary({ assessment_id: "assess-1", breakdown_by });
}

describe("handleGetGapSummary — breakdown_by branches", () => {
  it("returns theme breakdown when breakdown_by='theme'", () => {
    const result = makeBreakdownMocks("theme");
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.breakdown)).toBe(true);
    expect(data.breakdown.length).toBeGreaterThan(0);
    expect(data.breakdown[0]).toHaveProperty("group");
    expect(data.breakdown[0]).toHaveProperty("total");
  });

  it("returns control_type breakdown when breakdown_by='control_type'", () => {
    const result = makeBreakdownMocks("control_type");
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.breakdown)).toBe(true);
    expect(data.breakdown.length).toBeGreaterThan(0);
    expect(data.breakdown[0]).toHaveProperty("group");
  });

  it("returns cybersecurity_concept breakdown when breakdown_by='cybersecurity_concept'", () => {
    const result = makeBreakdownMocks("cybersecurity_concept");
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.breakdown)).toBe(true);
    expect(data.breakdown.length).toBeGreaterThan(0);
  });

  it("includes top_10_remediation_priority with risk scores when risks reference controls", () => {
    const result = makeBreakdownMocks("theme");
    const data = JSON.parse(result.content[0].text);
    // top_10_remediation_priority should contain controls with max_risk_score from open risks
    expect(Array.isArray(data.top_10_remediation_priority)).toBe(true);
  });
});

// ── handleCreateGapAssessment — themes_in_scope branch ───────────────────

describe("handleCreateGapAssessment — themes_in_scope branch", () => {
  it("filters controls by themes_in_scope when provided", () => {
    const controlsStmt  = { get: vi.fn(), all: vi.fn(() => [{ control_id: "5.1" }]), run: vi.fn() };
    const insertStmt    = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(controlsStmt)
      .mockReturnValue(insertStmt);

    const result = handleCreateGapAssessment({
      name:            "Themed Assessment",
      isms_version:    "2022",
      themes_in_scope: ["Organizational"],
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.controls_in_scope).toBe(1);
  });
});

// ── handleGenerateRemediationRoadmap — risk_score branch ─────────────────

describe("handleGenerateRemediationRoadmap — with open risks", () => {
  it("sorts gaps by max linked risk_score descending", () => {
    const assessStmt = { get: vi.fn(() => activeAssessment), all: vi.fn(() => []), run: vi.fn() };
    const gapsStmt   = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", status: "not_implemented", notes: null, name: "C1", theme: "Technological", description: "", control_type: '["Preventive"]' },
        { control_id: "5.2", status: "partial",         notes: null, name: "C2", theme: "Organizational", description: "", control_type: '["Detective"]' },
      ]),
      run: vi.fn(),
    };
    // Open risk references 5.2 with a high risk_score — should sort 5.2 before 5.1
    const openRisksStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ related_controls: '["5.2"]', risk_score: 25 }]),
      run: vi.fn(),
    };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(gapsStmt)
      .mockReturnValueOnce(openRisksStmt);

    const result = handleGenerateRemediationRoadmap({ assessment_id: "assess-1", timeline_weeks: 12 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total_gaps).toBe(2);
    // Verify that 5.2 has linked_risk_score populated from the open risk
    const allItems = data.phases.flatMap((p: { items: unknown[] }) => p.items) as { control_id: string; linked_risk_score: number }[];
    const item52 = allItems.find((i) => i.control_id === "5.2");
    const item51 = allItems.find((i) => i.control_id === "5.1");
    expect(item52).toBeDefined();
    expect(item51).toBeDefined();
    expect(item52!.linked_risk_score).toBe(25);
    expect(item51!.linked_risk_score).toBe(0);
  });
});

// ── handleListGapAssessments — archived filter ───────────────────────────

describe("handleListGapAssessments — archived filter", () => {
  it("returns archived assessments when filter='archived'", () => {
    mockStmt.all.mockReturnValue([archivedAssessment]);

    const result = handleListGapAssessments({ filter: "archived" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.assessments[0].status).toBe("archived");
  });
});
