/**
 * Unit tests for src/tools/risks.ts
 *
 * Tests: handleCreateRisk, handleGetRisk, handleUpdateRisk, handleListRisks,
 *        handleGetRiskSummary, handleCreateTreatmentPlan,
 *        handleUpdateTreatmentStatus, handleGenerateRiskRegister
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
  handleCreateRisk,
  handleGetRisk,
  handleUpdateRisk,
  handleListRisks,
  handleGetRiskSummary,
  handleCreateTreatmentPlan,
  handleUpdateTreatmentStatus,
  handleGenerateRiskRegister,
} from "../../../src/tools/risks.js";
import { McpError } from "../../../src/types/errors.js";

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseRiskRow = {
  id: "risk-uuid-1",
  asset: "Customer Database",
  threat: "Unauthorized access",
  vulnerability: "Weak passwords",
  likelihood: 3,
  impact: 4,
  risk_score: 12,
  risk_level: "high",
  owner: "security-team",
  status: "open",
  related_controls: '["5.1","5.2"]',
  created_at: "2024-01-01 00:00:00Z",
  updated_at: "2024-01-01 00:00:00Z",
};

const baseTreatmentRow = {
  id: "treat-uuid-1",
  risk_id: "risk-uuid-1",
  treatment_type: "mitigate",
  description: "Enforce MFA for all users",
  owner: "security-team",
  due_date: "2024-06-30",
  controls: '["8.5"]',
  status: "planned",
  residual_likelihood: null,
  residual_impact: null,
  residual_risk_score: null,
  residual_risk_level: null,
  evidence_ref: null,
  created_at: "2024-01-01 00:00:00Z",
  updated_at: "2024-01-01 00:00:00Z",
};

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
  mockStmt.run.mockReturnValue({ changes: 1 });
});

// ── handleCreateRisk ──────────────────────────────────────────────────────

describe("handleCreateRisk", () => {
  it("inserts risk and reads back the row (risk_score is computed by DB)", () => {
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => baseRiskRow), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(insertStmt)  // INSERT INTO risks
      .mockReturnValueOnce(selectStmt); // SELECT * FROM risks WHERE id = ?

    const result = handleCreateRisk({
      asset: "Customer Database",
      threat: "Unauthorized access",
      vulnerability: "Weak passwords",
      likelihood: 3,
      impact: 4,
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    // risk_score must come from the DB read-back, not computed in handler
    expect(data.risk_score).toBe(12);
    expect(data.risk_level).toBe("high");
    expect(Array.isArray(data.related_controls)).toBe(true);

    // Verify that both INSERT and SELECT were called
    expect(insertStmt.run).toHaveBeenCalled();
    expect(selectStmt.get).toHaveBeenCalled();
  });

  it("does not pass risk_score to the INSERT statement", () => {
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => baseRiskRow), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    handleCreateRisk({
      asset: "Server",
      threat: "DDoS",
      vulnerability: "No rate limiting",
      likelihood: 2,
      impact: 5,
    });

    // The INSERT sql passed to prepare() must NOT contain risk_score column
    const insertSql = (mockDb.prepare.mock.calls[0] as unknown[])[0] as string;
    expect(insertSql).not.toMatch(/risk_score/);
  });
});

// ── handleGetRisk ─────────────────────────────────────────────────────────

describe("handleGetRisk", () => {
  it("returns shaped risk row without treatments by default", () => {
    // requireRisk calls prepare().get()
    mockStmt.get.mockReturnValue(baseRiskRow);

    const result = handleGetRisk({ risk_id: "risk-uuid-1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe("risk-uuid-1");
    expect(Array.isArray(data.related_controls)).toBe(true);
    expect(data.treatments).toBeUndefined();
  });

  it("includes treatments array when include_treatments=true", () => {
    const riskStmt       = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
    const treatmentsStmt = { get: vi.fn(), all: vi.fn(() => [baseTreatmentRow]), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(riskStmt)
      .mockReturnValueOnce(treatmentsStmt);

    const result = handleGetRisk({ risk_id: "risk-uuid-1", include_treatments: true });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.treatments)).toBe(true);
    expect(data.treatments).toHaveLength(1);
    expect(Array.isArray(data.treatments[0].controls)).toBe(true);
  });

  it("throws NOT_FOUND McpError when risk does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetRisk({ risk_id: "nonexistent" })).toThrow(McpError);
    try {
      handleGetRisk({ risk_id: "nonexistent" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleUpdateRisk ──────────────────────────────────────────────────────

describe("handleUpdateRisk", () => {
  it("reads existing risk, runs UPDATE, then reads back updated row", () => {
    const existingStmt = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const updatedRow   = { ...baseRiskRow, status: "accepted", risk_score: 12 };
    const selectStmt   = { get: vi.fn(() => updatedRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(existingStmt) // requireRisk
      .mockReturnValueOnce(updateStmt)   // UPDATE
      .mockReturnValueOnce(selectStmt);  // SELECT read-back

    const result = handleUpdateRisk({ risk_id: "risk-uuid-1", status: "accepted" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("accepted");
  });

  it("throws NOT_FOUND when risk_id does not exist", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    expect(() => handleUpdateRisk({ risk_id: "bad-id", status: "accepted" })).toThrow(McpError);
    try {
      const missingStmt2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(missingStmt2);
      handleUpdateRisk({ risk_id: "bad-id", status: "accepted" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleListRisks ───────────────────────────────────────────────────────

describe("handleListRisks", () => {
  it("returns paginated risks with total", () => {
    const countStmt = { get: vi.fn(() => ({ n: 5 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseRiskRow]), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListRisks({ limit: 10, offset: 0 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(5);
    expect(data.risks).toHaveLength(1);
  });
});

// ── handleGetRiskSummary ──────────────────────────────────────────────────

describe("handleGetRiskSummary", () => {
  it("returns a heatmap_5x5 with a 5x5 matrix of numbers", () => {
    // Sequence of prepare() calls:
    // 1. byLevel all()
    // 2. byStatus all()
    // 3. byTreatment all()
    // 4. total get()
    // 5. top10 all()
    // 6. openTreatments get()
    // 7. heatmapRows all()
    const byLevelStmt       = { get: vi.fn(), all: vi.fn(() => [{ risk_level: "high", count: 3 }, { risk_level: "medium", count: 2 }]), run: vi.fn() };
    const byStatusStmt      = { get: vi.fn(), all: vi.fn(() => [{ status: "open", count: 4 }]), run: vi.fn() };
    const byTreatmentStmt   = { get: vi.fn(), all: vi.fn(() => [{ treatment_type: "mitigate", count: 2 }]), run: vi.fn() };
    const totalStmt         = { get: vi.fn(() => ({ n: 5 })), all: vi.fn(() => []), run: vi.fn() };
    const top10Stmt         = { get: vi.fn(), all: vi.fn(() => [baseRiskRow]), run: vi.fn() };
    const openTreatStmt     = { get: vi.fn(() => ({ n: 2 })), all: vi.fn(() => []), run: vi.fn() };
    const heatmapStmt       = { get: vi.fn(), all: vi.fn(() => [{ likelihood: 3, impact: 4, count: 3 }]), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(byLevelStmt)
      .mockReturnValueOnce(byStatusStmt)
      .mockReturnValueOnce(byTreatmentStmt)
      .mockReturnValueOnce(totalStmt)
      .mockReturnValueOnce(top10Stmt)
      .mockReturnValueOnce(openTreatStmt)
      .mockReturnValueOnce(heatmapStmt);

    const result = handleGetRiskSummary({});

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);

    // Verify heatmap structure
    expect(data.heatmap_5x5).toBeDefined();
    expect(Array.isArray(data.heatmap_5x5.matrix)).toBe(true);
    expect(data.heatmap_5x5.matrix).toHaveLength(5);
    data.heatmap_5x5.matrix.forEach((row: unknown) => {
      expect(Array.isArray(row)).toBe(true);
      expect((row as number[]).length).toBe(5);
      (row as number[]).forEach((cell) => expect(typeof cell).toBe("number"));
    });

    // Verify the seeded value is in the correct position (likelihood=3, impact=4 → [2][3])
    expect(data.heatmap_5x5.matrix[2][3]).toBe(3);

    // Verify other summary fields
    expect(data.total_risks).toBe(5);
    expect(data.open_treatments).toBe(2);
    expect(Array.isArray(data.top_10_by_score)).toBe(true);
  });
});

// ── handleCreateTreatmentPlan ─────────────────────────────────────────────

describe("handleCreateTreatmentPlan", () => {
  it("creates a mitigate treatment plan with controls array", () => {
    const requireRiskStmt  = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt       = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const selectStmt       = { get: vi.fn(() => baseTreatmentRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(requireRiskStmt)
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleCreateTreatmentPlan({
      risk_id: "risk-uuid-1",
      treatment_type: "mitigate",
      description: "Enforce MFA",
      owner: "security-team",
      due_date: "2024-06-30",
      controls: ["8.5"],
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.treatment_type).toBe("mitigate");
    expect(Array.isArray(data.controls)).toBe(true);
  });

  it("throws BUSINESS_RULE McpError when mitigate treatment has no controls[]", () => {
    const requireRiskStmt = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(requireRiskStmt);

    expect(() =>
      handleCreateTreatmentPlan({
        risk_id: "risk-uuid-1",
        treatment_type: "mitigate",
        description: "Enforce MFA",
        owner: "security-team",
        due_date: "2024-06-30",
        // intentionally no controls
      })
    ).toThrow(McpError);

    try {
      const requireRiskStmt2 = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(requireRiskStmt2);
      handleCreateTreatmentPlan({
        risk_id: "risk-uuid-1",
        treatment_type: "mitigate",
        description: "Enforce MFA",
        owner: "security-team",
        due_date: "2024-06-30",
      });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("creates an 'accept' treatment plan without requiring controls[]", () => {
    const requireRiskStmt = { get: vi.fn(() => baseRiskRow), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt      = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const acceptTreatRow  = { ...baseTreatmentRow, treatment_type: "accept", controls: null };
    const selectStmt      = { get: vi.fn(() => acceptTreatRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(requireRiskStmt)
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleCreateTreatmentPlan({
      risk_id: "risk-uuid-1",
      treatment_type: "accept",
      description: "Risk accepted by management",
      owner: "ciso",
      due_date: "2024-12-31",
      // no controls — should be fine for accept
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.treatment_type).toBe("accept");
  });

  it("throws NOT_FOUND when risk_id does not exist", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    expect(() =>
      handleCreateTreatmentPlan({
        risk_id: "bad-id",
        treatment_type: "accept",
        description: "Accept it",
        owner: "ciso",
        due_date: "2024-12-31",
      })
    ).toThrow(McpError);
  });
});

// ── handleUpdateTreatmentStatus ───────────────────────────────────────────

describe("handleUpdateTreatmentStatus", () => {
  it("updates treatment status and returns shaped row", () => {
    const existingStmt = { get: vi.fn(() => ({ id: "treat-uuid-1" })), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const updatedRow   = { ...baseTreatmentRow, status: "in_progress" };
    const selectStmt   = { get: vi.fn(() => updatedRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(existingStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleUpdateTreatmentStatus({
      treatment_id: "treat-uuid-1",
      status: "in_progress",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("in_progress");
  });

  it("throws NOT_FOUND when treatment_id does not exist", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    expect(() =>
      handleUpdateTreatmentStatus({ treatment_id: "bad-id", status: "completed" })
    ).toThrow(McpError);
    try {
      const missingStmt2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(missingStmt2);
      handleUpdateTreatmentStatus({ treatment_id: "bad-id", status: "completed" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleGenerateRiskRegister ────────────────────────────────────────────

describe("handleGenerateRiskRegister", () => {
  const riskWithTreatments = { ...baseRiskRow, treatment_types: "mitigate,accept" };

  it("generates json format risk register", () => {
    mockStmt.all.mockReturnValue([riskWithTreatments]);

    const result = handleGenerateRiskRegister({ format: "json" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);
    expect(Array.isArray(data.risks)).toBe(true);
    expect(Array.isArray(data.risks[0].treatment_types)).toBe(true);
  });

  it("generates csv format risk register", () => {
    mockStmt.all.mockReturnValue([riskWithTreatments]);

    const result = handleGenerateRiskRegister({ format: "csv" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe("csv");
    expect(data.content).toContain("risk_score");
  });

  it("generates markdown format risk register", () => {
    mockStmt.all.mockReturnValue([riskWithTreatments]);

    const result = handleGenerateRiskRegister({ format: "markdown" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.format).toBe("markdown");
    expect(data.content).toContain("# Risk Register");
  });

  it("renders '—' placeholder for null owner in markdown format", () => {
    const riskNoOwner = { ...baseRiskRow, owner: null, treatment_types: null };
    mockStmt.all.mockReturnValue([riskNoOwner]);

    const result = handleGenerateRiskRegister({ format: "markdown" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.content).toContain("—");
  });

  it("returns empty treatment_types array for json format when treatment_types is null", () => {
    const riskNoTreatments = { ...baseRiskRow, treatment_types: null };
    mockStmt.all.mockReturnValue([riskNoTreatments]);

    const result = handleGenerateRiskRegister({ format: "json" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.risks[0].treatment_types).toHaveLength(0);
  });

  it("applies risk_level_filter and status_filter", () => {
    mockStmt.all.mockReturnValue([riskWithTreatments]);

    const result = handleGenerateRiskRegister({
      format: "json",
      risk_level_filter: "high",
      status_filter: "open",
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);
  });
});

// ── handleListRisks — with filters ───────────────────────────────────────

describe("handleListRisks — with filters", () => {
  it("applies risk_level, status, and owner filters", () => {
    const countStmt = { get: vi.fn(() => ({ n: 2 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseRiskRow, { ...baseRiskRow, id: "risk-2" }]), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListRisks({ risk_level: "high", status: "open", owner: "security-team" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(2);
    expect(data.risks).toHaveLength(2);
  });
});
