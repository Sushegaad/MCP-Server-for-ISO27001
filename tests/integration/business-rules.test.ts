/**
 * iso27001-mcp — Business rules integration tests
 *
 * Tests the key business rules end-to-end through handler code,
 * using a mocked database so native SQLite is not required.
 * These tests run in both local and CI environments.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError } from "../../src/types/errors.js";

// ── Mock DB singleton ─────────────────────────────────────────
// All DB calls route through this mock. Individual tests override
// mockStmt.get / mockStmt.all / mockStmt.run as needed.

const mockRun = vi.fn(() => ({ changes: 1 }));
const mockGet = vi.fn();
const mockAll = vi.fn(() => [] as unknown[]);

const mockStmt = {
  get:  mockGet,
  all:  mockAll,
  run:  mockRun,
};

const mockDb = {
  prepare:     vi.fn(() => mockStmt),
  transaction: vi.fn((fn: () => unknown) => () => fn()),
};

vi.mock("../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Handler imports (after mock is registered) ────────────────

import { handleUpdateControlStatus }   from "../../src/tools/gap-analysis.js";
import { handleCreateTreatmentPlan }   from "../../src/tools/risks.js";
import { handleUpdateCorrectiveAction } from "../../src/tools/audit-management.js";

// ── Reset mocks between tests ─────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockGet.mockReset();
  mockAll.mockReset();
  mockAll.mockReturnValue([]);
  mockRun.mockReturnValue({ changes: 1 });
});

// ── Business rule: silent downgrade (implemented → partial) ───

describe("Business rule: silent status downgrade", () => {
  it("'implemented' without evidence_refs is silently downgraded to 'partial' with a warning", () => {
    // First prepare() call: SELECT gap_assessments WHERE id = ?
    // Second prepare() call: SELECT control_statuses WHERE assessment_id AND control_id
    mockGet
      .mockReturnValueOnce({ id: "a1", status: "active" })   // assessment row
      .mockReturnValueOnce({ id: "cs1" });                    // existing control_status row

    const result = handleUpdateControlStatus({
      assessment_id: "a1",
      control_id:    "5.1",
      status:        "implemented",
      // No evidence_refs — triggers silent downgrade
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text) as {
      status: string; warning?: string;
    };
    expect(data.status).toBe("partial");
    expect(data.warning).toBeDefined();
    expect(data.warning).toMatch(/downgraded/i);
  });

  it("'implemented' with evidence_refs is NOT downgraded", () => {
    mockGet
      .mockReturnValueOnce({ id: "a1", status: "active" })
      .mockReturnValueOnce({ id: "cs1" });

    const result = handleUpdateControlStatus({
      assessment_id: "a1",
      control_id:    "5.1",
      status:        "implemented",
      evidence_refs: ["550e8400-e29b-41d4-a716-446655440001"],
    });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text) as {
      status: string; warning?: string;
    };
    expect(data.status).toBe("implemented");
    expect(data.warning).toBeUndefined();
  });
});

// ── Business rule: na_justification required for status=na ───

describe("Business rule: na_justification required", () => {
  it("status='na' without na_justification throws McpError (BUSINESS_RULE)", () => {
    mockGet.mockReturnValueOnce({ id: "a1", status: "active" });

    expect(() =>
      handleUpdateControlStatus({
        assessment_id: "a1",
        control_id:    "5.1",
        status:        "na",
        // No na_justification
      }),
    ).toThrow(McpError);
  });

  it("status='na' without na_justification error_code is BUSINESS_RULE", () => {
    mockGet.mockReturnValueOnce({ id: "a1", status: "active" });

    let caught: McpError | null = null;
    try {
      handleUpdateControlStatus({
        assessment_id: "a1",
        control_id:    "5.1",
        status:        "na",
      });
    } catch (e) {
      caught = e as McpError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.error_code).toBe("BUSINESS_RULE");
  });

  it("status='na' WITH na_justification succeeds", () => {
    mockGet
      .mockReturnValueOnce({ id: "a1", status: "active" })
      .mockReturnValueOnce({ id: "cs1" });

    const result = handleUpdateControlStatus({
      assessment_id:   "a1",
      control_id:      "5.1",
      status:          "na",
      na_justification: "Control not applicable — cloud-only deployment.",
    });

    expect(result.isError).toBe(false);
  });
});

// ── Business rule: mitigate treatment requires controls[] ─────

describe("Business rule: mitigate treatment requires controls[]", () => {
  it("treatment_type='mitigate' without controls throws McpError (BUSINESS_RULE)", () => {
    mockGet.mockReturnValueOnce({ id: "r1" }); // risk exists

    expect(() =>
      handleCreateTreatmentPlan({
        risk_id:        "550e8400-e29b-41d4-a716-446655440000",
        treatment_type: "mitigate",
        description:    "Mitigate the risk with additional controls.",
        owner:          "Alice Smith",
        due_date:       "2026-12-31",
        // No controls[]
      }),
    ).toThrow(McpError);
  });

  it("treatment_type='mitigate' without controls has error_code BUSINESS_RULE", () => {
    mockGet.mockReturnValueOnce({ id: "r1" });

    let caught: McpError | null = null;
    try {
      handleCreateTreatmentPlan({
        risk_id:        "550e8400-e29b-41d4-a716-446655440000",
        treatment_type: "mitigate",
        description:    "Mitigate.",
        owner:          "Alice",
        due_date:       "2026-12-31",
      });
    } catch (e) {
      caught = e as McpError;
    }
    expect(caught?.error_code).toBe("BUSINESS_RULE");
  });

  it("treatment_type='accept' without controls succeeds", () => {
    const riskId = "550e8400-e29b-41d4-a716-446655440000";
    const treatmentRow = {
      id: "t1", risk_id: riskId, treatment_type: "accept",
      description: "Accept the risk.", owner: "Alice", due_date: "2026-12-31",
      controls: null, status: "planned",
      residual_likelihood: null, residual_impact: null,
      residual_risk_score: null, residual_risk_level: null,
      evidence_ref: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    mockGet
      .mockReturnValueOnce({ id: riskId })  // requireRisk
      .mockReturnValueOnce(treatmentRow);   // SELECT back after INSERT

    const result = handleCreateTreatmentPlan({
      risk_id:        riskId,
      treatment_type: "accept",
      description:    "Accept the residual risk.",
      owner:          "Alice",
      due_date:       "2026-12-31",
    });

    expect(result.isError).toBe(false);
  });
});

// ── Business rule: CAR closure requires effectiveness_verified ─

describe("Business rule: CAR closure requires effectiveness_verified (Clause 10.1)", () => {
  it("closing a CAR without effectiveness_verified=true throws McpError", () => {
    mockGet.mockReturnValueOnce({
      id: "car1", finding_id: "f1",
      description: "Fix the issue.", owner: "Bob",
      due_date: "2026-12-31", status: "open",
      root_cause: null, effectiveness_verified: 0, evidence_ref: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(() =>
      handleUpdateCorrectiveAction({
        car_id: "550e8400-e29b-41d4-a716-446655440000",
        status: "closed",
        // effectiveness_verified not provided (undefined → not true)
      }),
    ).toThrow(McpError);
  });

  it("closing a CAR without effectiveness_verified has error_code BUSINESS_RULE", () => {
    mockGet.mockReturnValueOnce({
      id: "car1", status: "open", effectiveness_verified: 0,
      finding_id: "f1", description: "Fix.", owner: "Bob",
      due_date: "2026-12-31", root_cause: null, evidence_ref: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    let caught: McpError | null = null;
    try {
      handleUpdateCorrectiveAction({
        car_id: "550e8400-e29b-41d4-a716-446655440000",
        status: "closed",
      });
    } catch (e) {
      caught = e as McpError;
    }
    expect(caught?.error_code).toBe("BUSINESS_RULE");
  });

  it("closing a CAR WITH effectiveness_verified=true succeeds", () => {
    const carRow = {
      id: "car1", finding_id: "f1",
      description: "Fix it.", owner: "Bob",
      due_date: "2026-12-31", status: "closed",
      root_cause: null, effectiveness_verified: 1, evidence_ref: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    // prepare() is called 3 times:
    //   1. SELECT corrective_actions WHERE id = ?  (existence check)
    //   2. UPDATE corrective_actions …
    //   3. SELECT corrective_actions WHERE id = ?  (SELECT back)
    const selectStmt = { get: vi.fn(() => carRow), run: vi.fn(), all: vi.fn(() => []) };
    const updateStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(selectStmt)  // existence check
      .mockReturnValueOnce(updateStmt)  // UPDATE
      .mockReturnValueOnce(selectStmt); // SELECT back

    const result = handleUpdateCorrectiveAction({
      car_id:                 "550e8400-e29b-41d4-a716-446655440000",
      status:                 "closed",
      effectiveness_verified: true,
    });

    expect(result.isError).toBe(false);
  });

  it("setting status='in_progress' without effectiveness_verified succeeds", () => {
    const carRow = {
      id: "car1", finding_id: "f1",
      description: "Fix it.", owner: "Bob",
      due_date: "2026-12-31", status: "in_progress",
      root_cause: null, effectiveness_verified: 0, evidence_ref: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const selectStmt = { get: vi.fn(() => carRow), run: vi.fn(), all: vi.fn(() => []) };
    const updateStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleUpdateCorrectiveAction({
      car_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "in_progress",
    });

    expect(result.isError).toBe(false);
  });
});

// ── Business rule: archived assessment rejection ───────────────

describe("Business rule: archived assessment rejection", () => {
  it("update_control_status on an archived assessment throws McpError", () => {
    mockGet.mockReturnValueOnce({ id: "a1", status: "archived" });

    expect(() =>
      handleUpdateControlStatus({
        assessment_id: "a1",
        control_id:    "5.1",
        status:        "partial",
      }),
    ).toThrow(McpError);
  });

  it("archived assessment error has error_code BUSINESS_RULE", () => {
    mockGet.mockReturnValueOnce({ id: "a1", status: "archived" });

    let caught: McpError | null = null;
    try {
      handleUpdateControlStatus({
        assessment_id: "a1",
        control_id:    "5.1",
        status:        "partial",
      });
    } catch (e) {
      caught = e as McpError;
    }
    expect(caught?.error_code).toBe("BUSINESS_RULE");
  });

  it("update_control_status on an active assessment succeeds", () => {
    mockGet
      .mockReturnValueOnce({ id: "a1", status: "active" })
      .mockReturnValueOnce({ id: "cs1" });

    const result = handleUpdateControlStatus({
      assessment_id: "a1",
      control_id:    "5.1",
      status:        "partial",
    });

    expect(result.isError).toBe(false);
  });
});
