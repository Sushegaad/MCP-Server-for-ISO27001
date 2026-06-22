/**
 * Unit tests for src/tools/audit-management.ts
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

// ── SUT imports (after vi.mock) ───────────────────────────────

import {
  handleCreateAudit,
  handleRecordFinding,
  handleCreateCorrectiveAction,
  handleUpdateCorrectiveAction,
  handleGenerateAuditReport,
} from "../../../src/tools/audit-management.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const AUDIT_ROW = {
  id: "audit-1",
  name: "Annual Internal Audit",
  scope: "All ISMS controls",
  auditor: "John Auditor",
  planned_date: "2025-06-01",
  actual_date: null,
  status: "planned",
  controls_in_scope: null,
  clauses_in_scope: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const FINDING_ROW = {
  id: "finding-1",
  audit_id: "audit-1",
  type: "nc",
  clause_or_control: "8.1",
  description: "Asset inventory not maintained",
  objective_evidence: "No inventory spreadsheet found",
  severity: "major",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const CAR_ROW = {
  id: "car-1",
  finding_id: "finding-1",
  description: "Create asset inventory",
  owner: "IT Manager",
  due_date: "2025-09-01",
  status: "open",
  root_cause: "No defined process",
  effectiveness_verified: 0,
  evidence_ref: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── create_audit ──────────────────────────────────────────────

describe("handleCreateAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns HITL preview when confirmed is omitted", () => {
    const result = handleCreateAudit({
      name: "Annual Internal Audit",
      scope: "All ISMS controls",
      auditor: "John Auditor",
      planned_date: "2025-06-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.diff).toContain("Annual Internal Audit");
    // No DB writes should have occurred
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it("creates an audit and returns the shaped row when confirmed=true", () => {
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const result = handleCreateAudit({
      name: "Annual Internal Audit",
      scope: "All ISMS controls",
      auditor: "John Auditor",
      planned_date: "2025-06-01",
      confirmed: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("audit-1");
    expect(data.name).toBe("Annual Internal Audit");
    expect(data.status).toBe("planned");
    expect(Array.isArray(data.controls_in_scope)).toBe(true);
    expect(Array.isArray(data.clauses_in_scope)).toBe(true);
  });

  it("serialises controls_in_scope and clauses_in_scope when confirmed=true", () => {
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = {
      run: vi.fn(),
      get: vi.fn(() => ({
        ...AUDIT_ROW,
        controls_in_scope: '["5.1","5.2"]',
        clauses_in_scope: '["6","8"]',
      })),
      all: vi.fn(() => []),
    };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const result = handleCreateAudit({
      name: "Scoped Audit",
      scope: "Clause 8",
      auditor: "Jane",
      planned_date: "2025-07-01",
      controls_in_scope: ["5.1", "5.2"],
      clauses_in_scope: ["6", "8"],
      confirmed: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.controls_in_scope).toContain("5.1");
  });
});

// ── record_finding ────────────────────────────────────────────

describe("handleRecordFinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns HITL preview when confirmed is omitted", () => {
    const auditStmt = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(auditStmt);

    const result = handleRecordFinding({
      audit_id: "audit-1",
      type: "nc",
      clause_or_control: "8.1",
      description: "Asset inventory not maintained",
      objective_evidence: "No inventory found",
      severity: "major",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.diff).toContain("8.1");
  });

  it("records an NC finding with severity when confirmed=true", () => {
    const auditStmt  = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => FINDING_ROW), all: vi.fn(() => []) };
    mockDb.prepare
      .mockReturnValueOnce(auditStmt)
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleRecordFinding({
      audit_id: "audit-1",
      type: "nc",
      clause_or_control: "8.1",
      description: "Asset inventory not maintained",
      objective_evidence: "No inventory found",
      severity: "major",
      confirmed: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("finding-1");
    expect(data.severity).toBe("major");
  });

  it("throws BUSINESS_RULE when NC type is missing severity", () => {
    const auditStmt = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(auditStmt);

    expect(() =>
      handleRecordFinding({
        audit_id: "audit-1",
        type: "nc",
        clause_or_control: "8.1",
        description: "Missing control",
        objective_evidence: "No evidence",
        // severity intentionally omitted
      }),
    ).toThrow(McpError);

    const auditStmt2 = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(auditStmt2);
    try {
      handleRecordFinding({
        audit_id: "audit-1",
        type: "nc",
        clause_or_control: "8.1",
        description: "Missing",
        objective_evidence: "None",
      });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("throws NOT_FOUND when audit_id does not exist", () => {
    const auditStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(auditStmt);

    expect(() =>
      handleRecordFinding({
        audit_id: "missing",
        type: "obs",
        clause_or_control: "6.1",
        description: "Observation",
        objective_evidence: "Meeting notes",
      }),
    ).toThrow(McpError);
  });

  it("records an OBS finding without severity when confirmed=true", () => {
    const obsRow = { ...FINDING_ROW, id: "finding-2", type: "obs", severity: null };
    const auditStmt  = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => obsRow), all: vi.fn(() => []) };
    mockDb.prepare
      .mockReturnValueOnce(auditStmt)
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleRecordFinding({
      audit_id: "audit-1",
      type: "obs",
      clause_or_control: "6.1",
      description: "Minor observation",
      objective_evidence: "Verbal confirmation",
      confirmed: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.type).toBe("obs");
    expect(data.severity).toBeNull();
  });
});

// ── create_corrective_action ──────────────────────────────────

describe("handleCreateCorrectiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns HITL preview when confirmed is omitted", () => {
    const findingStmt = { get: vi.fn(() => FINDING_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(findingStmt);

    const result = handleCreateCorrectiveAction({
      finding_id: "finding-1",
      description: "Create asset inventory",
      owner: "IT Manager",
      due_date: "2025-09-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.diff).toContain("finding_id");
    // No DB insert should have been called (only the requireFinding lookup)
    expect(findingStmt.run).not.toHaveBeenCalled();
  });

  it("creates a corrective action and returns it with boolean effectiveness_verified when confirmed=true", () => {
    const findingStmt = { get: vi.fn(() => FINDING_ROW), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt  = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt  = { run: vi.fn(), get: vi.fn(() => CAR_ROW), all: vi.fn(() => []) };
    mockDb.prepare
      .mockReturnValueOnce(findingStmt)
      .mockReturnValueOnce(insertStmt)
      .mockReturnValueOnce(selectStmt);

    const result = handleCreateCorrectiveAction({
      finding_id: "finding-1",
      description: "Create asset inventory",
      owner: "IT Manager",
      due_date: "2025-09-01",
      root_cause: "No defined process",
      confirmed: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("car-1");
    expect(data.status).toBe("open");
    expect(typeof data.effectiveness_verified).toBe("boolean");
    expect(data.effectiveness_verified).toBe(false);
  });
});

// ── update_corrective_action ──────────────────────────────────

describe("handleUpdateCorrectiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws BUSINESS_RULE (Clause 10.1) when closing CAR without effectiveness_verified", () => {
    const selectStmt = { get: vi.fn(() => CAR_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(selectStmt);

    expect(() =>
      handleUpdateCorrectiveAction({
        car_id: "car-1",
        status: "closed",
        // effectiveness_verified intentionally omitted / false
      }),
    ).toThrow(McpError);

    const selectStmt2 = { get: vi.fn(() => CAR_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(selectStmt2);
    try {
      handleUpdateCorrectiveAction({ car_id: "car-1", status: "closed" });
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      const mcpErr = err as McpError;
      expect(mcpErr.error_code).toBe("BUSINESS_RULE");
      expect(mcpErr.message).toContain("effectiveness_verified");
      expect(mcpErr.message).toContain("10.1");
    }
  });

  it("allows closing a CAR when effectiveness_verified is true", () => {
    const closedCar = { ...CAR_ROW, status: "closed", effectiveness_verified: 1 };
    const selectStmt = { get: vi.fn(() => CAR_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectBackStmt = { run: vi.fn(), get: vi.fn(() => closedCar), all: vi.fn(() => []) };
    mockDb.prepare
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(selectBackStmt);

    const result = handleUpdateCorrectiveAction({
      car_id: "car-1",
      status: "closed",
      effectiveness_verified: true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.status).toBe("closed");
    expect(data.effectiveness_verified).toBe(true);
  });

  it("throws NOT_FOUND for non-existent car_id", () => {
    const selectStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(selectStmt);

    expect(() =>
      handleUpdateCorrectiveAction({ car_id: "missing", status: "in_progress" }),
    ).toThrow(McpError);
  });
});

// ── generate_audit_report ─────────────────────────────────────

describe("handleGenerateAuditReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns JSON format report with summary", () => {
    const auditStmt    = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const findingsStmt = { get: vi.fn(), all: vi.fn(() => [FINDING_ROW]), run: vi.fn() };
    const carsStmt     = { get: vi.fn(), all: vi.fn(() => [CAR_ROW]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(auditStmt)
      .mockReturnValueOnce(findingsStmt)
      .mockReturnValueOnce(carsStmt);

    const result = handleGenerateAuditReport({ audit_id: "audit-1", format: "json" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.audit.id).toBe("audit-1");
    expect(data.summary.total_findings).toBe(1);
    expect(data.summary.nc_count).toBe(1);
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.findings[0].corrective_actions).toHaveLength(1);
    expect(typeof data.findings[0].corrective_actions[0].effectiveness_verified).toBe("boolean");
  });

  it("returns markdown format report", () => {
    const auditStmt    = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const findingsStmt = { get: vi.fn(), all: vi.fn(() => [FINDING_ROW]), run: vi.fn() };
    const carsStmt     = { get: vi.fn(), all: vi.fn(() => [CAR_ROW]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(auditStmt)
      .mockReturnValueOnce(findingsStmt)
      .mockReturnValueOnce(carsStmt);

    const result = handleGenerateAuditReport({ audit_id: "audit-1", format: "markdown" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.format).toBe("markdown");
    expect(data.content).toContain("# Audit Report:");
    expect(data.content).toContain("Annual Internal Audit");
  });

  it("returns empty findings when no findings exist", () => {
    const auditStmt    = { get: vi.fn(() => AUDIT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const findingsStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(auditStmt)
      .mockReturnValueOnce(findingsStmt);
    // No CARs stmt needed since findings is empty

    const result = handleGenerateAuditReport({ audit_id: "audit-1", format: "json" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.summary.total_findings).toBe(0);
    expect(data.summary.total_cars).toBe(0);
  });
});
