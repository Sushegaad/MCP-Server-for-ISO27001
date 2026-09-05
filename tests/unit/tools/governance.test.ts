/**
 * Unit tests for src/tools/governance.ts — Group 16: Risk Governance
 *
 * Tests: handleSetRiskMethodology, handleRecordRiskAcceptance,
 *        handleListRiskAcceptances
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
  handleSetRiskMethodology,
  handleRecordRiskAcceptance,
  handleListRiskAcceptances,
} from "../../../src/tools/governance.js";
import { McpError } from "../../../src/types/errors.js";
import { _testSeedProposal } from "../../../src/tools/hitl-utils.js";

// ── Fixtures ──────────────────────────────────────────────────────────────

const LIKELIHOOD_SCALE = [
  { value: 1, label: "Rare" },
  { value: 5, label: "Almost certain" },
];
const IMPACT_SCALE = [
  { value: 1, label: "Negligible" },
  { value: 5, label: "Severe" },
];
const LEVEL_BANDS = [
  { min: 1, max: 5, level: "Low" },
  { min: 6, max: 25, level: "High" },
];

const METHODOLOGY_ARGS = {
  likelihood_scale:     LIKELIHOOD_SCALE,
  impact_scale:         IMPACT_SCALE,
  calculation_method:   "multiplication",
  risk_level_bands:     LEVEL_BANDS,
  acceptance_threshold: 6,
  review_frequency:     "annual",
};

const METHODOLOGY_ROW = {
  id: "default",
  likelihood_scale:     JSON.stringify(LIKELIHOOD_SCALE),
  impact_scale:         JSON.stringify(IMPACT_SCALE),
  calculation_method:   "multiplication",
  risk_level_bands:     JSON.stringify(LEVEL_BANDS),
  acceptance_threshold: 6,
  escalation_rules:     null,
  review_frequency:     "annual",
  created_at:           "2025-01-01 00:00:00Z",
  updated_at:           "2025-01-01 00:00:00Z",
};

const RISK_ROW = {
  id: "risk-uuid-1",
  asset: "Customer Database",
  threat: "Unauthorized access",
  vulnerability: "Weak passwords",
  likelihood: 4,
  impact: 5,
  risk_score: 20,
  risk_level: "Critical",
  owner: "security-team",
  status: "open",
  related_controls: null,
  created_at: "2025-01-01 00:00:00Z",
  updated_at: "2025-01-01 00:00:00Z",
};

const PLAN_ROW = {
  id: "plan-uuid-1",
  risk_id: "risk-uuid-1",
  treatment_type: "mitigate",
  description: "Enforce MFA",
  owner: "security-team",
  due_date: "2026-06-30",
  controls: '["8.5"]',
  status: "in_progress",
  residual_likelihood: 2,
  residual_impact: 2,
  residual_risk_score: 4,
  residual_risk_level: "Low",
  evidence_ref: null,
  created_at: "2025-01-01 00:00:00Z",
  updated_at: "2025-01-01 00:00:00Z",
};

const ACCEPTANCE_ROW = {
  id: "acc-uuid-1",
  risk_id: "risk-uuid-1",
  treatment_plan_id: "plan-uuid-1",
  risk_owner: "Alice CISO",
  decision: "accepted",
  inherent_score: 20,
  residual_score: 4,
  acceptance_threshold_at_decision: 6,
  rationale: "Residual risk within appetite after MFA rollout.",
  approved_at: "2025-02-01 00:00:00Z",
  review_due_at: null,
  created_at: "2025-02-01 00:00:00Z",
};

const stmt = (row?: unknown, rows: unknown[] = []) => ({
  get: vi.fn(() => row),
  all: vi.fn(() => rows),
  run: vi.fn(() => ({ changes: 1 })),
});

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
  mockStmt.run.mockReturnValue({ changes: 1 });
});

// ── handleSetRiskMethodology ──────────────────────────────────────────────

describe("handleSetRiskMethodology", () => {
  it("preview (no existing methodology): shows every field against null", () => {
    mockDb.prepare.mockReturnValueOnce(stmt(undefined)); // singleton lookup

    const result = handleSetRiskMethodology({ ...METHODOLOGY_ARGS });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.message).toContain("create");
    expect(data.diff).toContain("acceptance_threshold");
    expect(data.diff).toContain("1=Rare");
    expect(data.diff).toContain("1–5: Low");
  });

  it("preview (existing methodology): diffs against the stored singleton", () => {
    mockDb.prepare.mockReturnValueOnce(stmt(METHODOLOGY_ROW));

    const result = handleSetRiskMethodology({
      ...METHODOLOGY_ARGS,
      acceptance_threshold: 9,
      escalation_rules: "CISO sign-off above 9",
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.hitl_proposed).toBe(true);
    expect(data.message).toContain("update");
    expect(data.diff).toContain("acceptance_threshold");
    expect(data.diff).toContain("9");
    expect(data.diff).toContain("escalation_rules");
  });

  it("commit (confirmed=true): upserts the singleton and echoes parsed fields", () => {
    const lookupStmt = stmt(undefined);
    const upsertStmt = stmt();
    mockDb.prepare
      .mockReturnValueOnce(lookupStmt)
      .mockReturnValueOnce(upsertStmt);

    const PROPOSAL = "11111111-1111-4111-8111-111111111111";
    _testSeedProposal(PROPOSAL, "set_risk_methodology");

    const result = handleSetRiskMethodology({
      ...METHODOLOGY_ARGS,
      escalation_rules: "Escalate above threshold to CISO",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe("default");
    expect(data.acceptance_threshold).toBe(6);
    expect(Array.isArray(data.likelihood_scale)).toBe(true);
    expect(data.escalation_rules).toContain("CISO");
    // The upsert must use INSERT OR REPLACE against the fixed singleton id
    const sql = (mockDb.prepare.mock.calls[1] as unknown[])[0] as string;
    expect(sql).toMatch(/INSERT OR REPLACE INTO risk_methodology/);
    expect(upsertStmt.run).toHaveBeenCalled();
  });

  it("commit binds to the existing row version (consumeProposal receives resource_version)", () => {
    const lookupStmt = stmt(METHODOLOGY_ROW);
    const upsertStmt = stmt();
    mockDb.prepare
      .mockReturnValueOnce(lookupStmt)
      .mockReturnValueOnce(upsertStmt);

    const PROPOSAL = "22222222-2222-4222-8222-222222222222";
    // Bind the token to the row's updated_at — matching version must succeed
    _testSeedProposal(PROPOSAL, "set_risk_methodology", {
      resource_version: String(METHODOLOGY_ROW.updated_at),
    });

    const result = handleSetRiskMethodology({
      ...METHODOLOGY_ARGS,
      confirmed: true,
      proposal_id: PROPOSAL,
    });
    expect(result.isError).toBe(false);
  });

  it("commit rejects a stale proposal when the singleton changed since preview", () => {
    const staleRow = { ...METHODOLOGY_ROW, updated_at: "2025-06-01 00:00:00Z" };
    mockDb.prepare.mockReturnValueOnce(stmt(staleRow));

    const PROPOSAL = "33333333-3333-4333-8333-333333333333";
    _testSeedProposal(PROPOSAL, "set_risk_methodology", {
      resource_version: "2025-01-01 00:00:00Z", // preview-time version
    });

    expect(() =>
      handleSetRiskMethodology({
        ...METHODOLOGY_ARGS,
        confirmed: true,
        proposal_id: PROPOSAL,
      }),
    ).toThrow(/version conflict/);
  });
});

// ── handleRecordRiskAcceptance ────────────────────────────────────────────

describe("handleRecordRiskAcceptance", () => {
  const BASE_ARGS = {
    risk_id:    "risk-uuid-1",
    risk_owner: "Alice CISO",
    decision:   "accepted",
    rationale:  "Residual risk within appetite after MFA rollout.",
  };

  it("throws NOT_FOUND when the risk does not exist", () => {
    mockDb.prepare.mockReturnValueOnce(stmt(undefined));

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("throws NOT_FOUND when treatment_plan_id does not exist", () => {
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt(undefined)); // plan lookup

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, treatment_plan_id: "missing-plan" });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("throws BUSINESS_RULE when the plan belongs to a different risk", () => {
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt({ ...PLAN_ROW, risk_id: "some-other-risk" }));

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, treatment_plan_id: "plan-uuid-1" });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("treatment_plan_id");
      expect((err as McpError).message).toMatch(/belongs to risk/);
    }
  });

  it("throws BUSINESS_RULE when the plan has no residual scores", () => {
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt({ ...PLAN_ROW, residual_likelihood: null, residual_impact: null }));

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, treatment_plan_id: "plan-uuid-1" });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).message).toMatch(/residual likelihood\/impact/i);
    }
  });

  it("throws BUSINESS_RULE when accepting an above-threshold residual with a short rationale", () => {
    // residual 4×4=16 > threshold 6, rationale < 50 chars
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt({ ...PLAN_ROW, residual_likelihood: 4, residual_impact: 4 }))
      .mockReturnValueOnce(stmt({ acceptance_threshold: 6 }));

    try {
      handleRecordRiskAcceptance({
        ...BASE_ARGS,
        treatment_plan_id: "plan-uuid-1",
        rationale: "Looks fine to me.",
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("rationale");
      expect((err as McpError).message).toMatch(/exceeds the acceptance threshold/);
    }
  });

  it("accepts an above-threshold residual when the rationale is substantive (>= 50 chars)", () => {
    const longRationale =
      "Business-critical dependency: compensating controls reviewed and approved by the board on 2026-01-15.";
    const insertStmt = stmt();
    const selectStmt = stmt({ ...ACCEPTANCE_ROW, residual_score: 16, rationale: longRationale });

    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt({ ...PLAN_ROW, residual_likelihood: 4, residual_impact: 4 }))
      .mockReturnValueOnce(stmt({ acceptance_threshold: 6 }))
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const PROPOSAL = "44444444-4444-4444-8444-444444444444";
    _testSeedProposal(PROPOSAL, "record_risk_acceptance");

    const result = handleRecordRiskAcceptance({
      ...BASE_ARGS,
      treatment_plan_id: "plan-uuid-1",
      rationale: longRationale,
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.residual_score).toBe(16);
    expect(insertStmt.run).toHaveBeenCalled();
  });

  it("does not apply the escalation rule to 'rejected' decisions", () => {
    // Above threshold + short rationale, but decision=rejected → no throw
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt({ ...PLAN_ROW, residual_likelihood: 4, residual_impact: 4 }))
      .mockReturnValueOnce(stmt({ acceptance_threshold: 6 }));

    const result = handleRecordRiskAcceptance({
      ...BASE_ARGS,
      decision: "rejected",
      treatment_plan_id: "plan-uuid-1",
      rationale: "Too risky.",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.hitl_proposed).toBe(true); // preview, not an error
  });

  it("preview shows the acceptance summary (decision, scores, threshold, owner)", () => {
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt(PLAN_ROW))
      .mockReturnValueOnce(stmt({ acceptance_threshold: 6 }));

    const result = handleRecordRiskAcceptance({
      ...BASE_ARGS,
      treatment_plan_id: "plan-uuid-1",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.risk_id).toBe("risk-uuid-1");
    expect(data.treatment_plan_id).toBe("plan-uuid-1");
    expect(data.diff).toContain("decision");
    expect(data.diff).toContain("inherent_score");
    expect(data.diff).toContain("residual_score");
    expect(data.diff).toContain("acceptance_threshold_at_decision");
    expect(data.diff).toContain("risk_owner");
  });

  it("commit without a plan records null residual_score and null threshold when unconfigured", () => {
    const insertStmt = stmt();
    const noPlantRow = {
      ...ACCEPTANCE_ROW,
      treatment_plan_id: null,
      residual_score: null,
      acceptance_threshold_at_decision: null,
    };
    const selectStmt = stmt(noPlantRow);

    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))       // risk lookup (no plan lookup)
      .mockReturnValueOnce(stmt(undefined))      // methodology lookup — not configured
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const PROPOSAL = "55555555-5555-4555-8555-555555555555";
    _testSeedProposal(PROPOSAL, "record_risk_acceptance");

    const result = handleRecordRiskAcceptance({
      ...BASE_ARGS,
      // Inherent 20 >= default High threshold (12, no methodology) — a
      // substantive rationale (>= 50 chars) is required to accept.
      rationale:
        "Compensating controls reviewed and accepted by the board; MFA rollout completes Q2 2026.",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.residual_score).toBeNull();
    expect(data.acceptance_threshold_at_decision).toBeNull();
    // INSERT args: residual_score (7th) and threshold (8th) are null
    const runArgs = insertStmt.run.mock.calls[0] as unknown[];
    expect(runArgs[6]).toBeNull();
    expect(runArgs[7]).toBeNull();
    expect(runArgs[5]).toBe(20); // inherent = 4 × 5
  });

  it("without a plan, the escalation rule uses the inherent score (no bypass by omitting the plan)", () => {
    // Methodology configured (threshold 6); no plan → effective = inherent 20 > 6
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))                        // risk lookup
      .mockReturnValueOnce(stmt({ acceptance_threshold: 6 }));    // methodology

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, rationale: "Fine." });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("rationale");
      expect((err as McpError).message).toMatch(/Inherent score 20/);
      expect((err as McpError).message).toMatch(/exceeds the acceptance threshold/);
    }
  });

  it("with NO methodology configured, the default High threshold (12) applies", () => {
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))       // risk lookup (inherent 20)
      .mockReturnValueOnce(stmt(undefined));     // methodology — not configured

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, rationale: "Fine." });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).message).toMatch(/no risk methodology configured/);
      expect((err as McpError).message).toMatch(/default High-risk threshold \(12\) applies; set_risk_methodology to customize/);
    }
  });

  it("rationale length is measured after trimming (padded whitespace does not count)", () => {
    const padded = " ".repeat(40) + "Short reason." + " ".repeat(40); // > 50 raw, < 50 trimmed
    mockDb.prepare
      .mockReturnValueOnce(stmt(RISK_ROW))
      .mockReturnValueOnce(stmt(undefined));

    try {
      handleRecordRiskAcceptance({ ...BASE_ARGS, rationale: padded });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("rationale");
    }
  });

  it("commit rejects a stale proposal when the risk changed since preview (version binding)", () => {
    const staleRisk = { ...RISK_ROW, likelihood: 1, impact: 2, updated_at: "2025-06-01 00:00:00Z" };
    mockDb.prepare
      .mockReturnValueOnce(stmt(staleRisk))     // risk lookup at commit
      .mockReturnValueOnce(stmt(undefined));    // methodology — not configured (1×2=2 < 12)

    const PROPOSAL = "66666666-6666-4666-8666-666666666666";
    _testSeedProposal(PROPOSAL, "record_risk_acceptance", {
      resource_version: "2025-01-01 00:00:00Z", // preview-time version
    });

    expect(() =>
      handleRecordRiskAcceptance({
        ...BASE_ARGS,
        confirmed: true,
        proposal_id: PROPOSAL,
      }),
    ).toThrow(/version conflict/);
  });
});

// ── handleListRiskAcceptances ─────────────────────────────────────────────

describe("handleListRiskAcceptances", () => {
  it("returns paginated acceptances with total", () => {
    const countStmt = stmt({ n: 3 });
    const rowsStmt  = stmt(undefined, [ACCEPTANCE_ROW]);

    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListRiskAcceptances({ limit: 10, offset: 0 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(3);
    expect(data.acceptances).toHaveLength(1);
    expect(data.acceptances[0].decision).toBe("accepted");
  });

  it("applies risk_id and decision filters", () => {
    const countStmt = stmt({ n: 1 });
    const rowsStmt  = stmt(undefined, [ACCEPTANCE_ROW]);

    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListRiskAcceptances({
      risk_id: "risk-uuid-1",
      decision: "accepted",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);

    const countSql = (mockDb.prepare.mock.calls[0] as unknown[])[0] as string;
    expect(countSql).toContain("risk_id = ?");
    expect(countSql).toContain("decision = ?");
    expect(countStmt.get).toHaveBeenCalledWith("risk-uuid-1", "accepted");
    expect(rowsStmt.all).toHaveBeenCalledWith("risk-uuid-1", "accepted", 50, 0);
  });

  it("returns an empty list when nothing matches", () => {
    const countStmt = stmt({ n: 0 });
    const rowsStmt  = stmt(undefined, []);

    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListRiskAcceptances({ decision: "rejected" });

    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(0);
    expect(data.acceptances).toHaveLength(0);
  });
});
