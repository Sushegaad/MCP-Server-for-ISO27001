/**
 * Unit tests for src/tools/csv-import.ts
 *
 * Tests: handleImportRisks, handleImportControlStatuses
 * DB is fully mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB module ────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
  run: vi.fn(() => ({ changes: 1 })),
};
const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: (rows: unknown[]) => unknown) => fn),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../src/db/dal.js", () => ({
  newId: vi.fn(() => "new-uuid-123"),
  now:   vi.fn(() => "2026-01-01 00:00:00Z"),
  toJson: vi.fn((v: unknown) => JSON.stringify(v)),
}));

// ── Import SUT after mocks ────────────────────────────────────

import {
  handleImportRisks,
  handleImportControlStatuses,
} from "../../../src/tools/csv-import.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

const VALID_RISKS_CSV = [
  "asset,threat,vulnerability,likelihood,impact,owner,status,related_controls",
  "Customer DB,SQL injection,Unparameterised queries,4,5,Head of Eng,open,8.28;8.20",
  "AWS IAM,Privilege escalation,Overly broad roles,3,4,Cloud Lead,open,",
].join("\n");

const ASSESSMENT_ROW = {
  id: "assess-uuid-1",
  name: "2026 Assessment",
  archived_at: null,
};

const VALID_STATUSES_CSV = [
  "control_id,status,notes",
  "5.1,implemented,Board approved",
  "5.2,partial,Draft in progress",
].join("\n");

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: assessment exists, not archived
  mockStmt.get.mockReturnValue(ASSESSMENT_ROW);
  // Default: control_assessments row exists
  mockDb.prepare.mockReturnValue(mockStmt);
});

// ── handleImportRisks ─────────────────────────────────────────

describe("handleImportRisks", () => {
  it("dry_run=true returns preview without writing", () => {
    const result = handleImportRisks({
      csv_content: VALID_RISKS_CSV,
      dry_run: true,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dry_run).toBe(true);
    expect(data.valid_rows).toBe(2);
    expect(data.error_rows).toBe(0);
    expect(data.preview).toHaveLength(2);
    expect(data.preview[0].asset).toBe("Customer DB");
    expect(data.preview[0].risk_score).toBe(20); // 4*5
    expect(data.preview[0].risk_level).toBe("Critical");
    expect(data.preview[1].risk_score).toBe(12); // 3*4
    expect(data.preview[1].risk_level).toBe("High");
    expect(mockDb.prepare).not.toHaveBeenCalled(); // no DB hit in dry-run
  });

  it("dry_run=true with errors shows error message variant", () => {
    const csv = [
      "asset,threat,vulnerability,likelihood,impact",
      ",Missing asset,some vuln,3,4",
    ].join("\n");
    const result = handleImportRisks({ csv_content: csv, dry_run: true });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dry_run).toBe(true);
    expect(data.error_rows).toBe(1);
    expect(data.message).toMatch(/have errors/);
  });

  it("imports valid rows and returns risk_ids", () => {
    // mock transaction to execute the callback synchronously
    mockDb.transaction.mockImplementation((fn: (rows: unknown[]) => string[]) => fn);

    const result = handleImportRisks({ csv_content: VALID_RISKS_CSV });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(true);
    expect(data.imported).toBe(2);
    expect(data.risk_ids).toHaveLength(2);
    expect(data.skipped_rows).toBe(0);
    expect(result.isError).toBe(false);
  });

  it("aborts without dry_run when rows have validation errors", () => {
    const csv = [
      "asset,threat,vulnerability,likelihood,impact",
      "Good Asset,Good Threat,Good Vuln,3,4",
      "Bad,Bad,Bad,0,6", // likelihood 0 and impact 6 are out of range
    ].join("\n");
    const result = handleImportRisks({ csv_content: csv });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].row).toBe(3);
    expect(mockDb.prepare).not.toHaveBeenCalled(); // no DB hit
  });

  it("uses default_status when row status is empty", () => {
    const csv = [
      "asset,threat,vulnerability,likelihood,impact",
      "Asset,Threat,Vuln,2,3",
    ].join("\n");
    mockDb.transaction.mockImplementation((fn: (rows: unknown[]) => string[]) => fn);
    handleImportRisks({ csv_content: csv, default_status: "accepted" });
    // The insert.run should have been called with "accepted" as status
    expect(mockStmt.run).toHaveBeenCalledWith(
      expect.any(String),
      "Asset", "Threat", "Vuln",
      2, 3,
      6, // risk_score = 2*3
      "Medium",
      null, // owner empty → null
      "accepted",
      expect.any(String), // toJson([])
      expect.any(String), expect.any(String),
    );
  });

  it("uses valid status from row when provided", () => {
    const csv = [
      "asset,threat,vulnerability,likelihood,impact,status",
      "Asset,Threat,Vuln,2,3,mitigated",
    ].join("\n");
    mockDb.transaction.mockImplementation((fn: (rows: unknown[]) => string[]) => fn);
    handleImportRisks({ csv_content: csv });
    expect(mockStmt.run).toHaveBeenCalledWith(
      expect.any(String),
      "Asset", "Threat", "Vuln",
      2, 3, 6, "Medium",
      null, "mitigated",
      expect.any(String), expect.any(String), expect.any(String),
    );
  });

  it("maps alternative header aliases (asset_name, probability, severity)", () => {
    const csv = [
      "asset_name,threat_name,vuln,probability,severity",
      "Alt Asset,Alt Threat,Alt Vuln,1,1",
    ].join("\n");
    const result = handleImportRisks({ csv_content: csv, dry_run: true });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.valid_rows).toBe(1);
    expect(data.preview[0].asset).toBe("Alt Asset");
    expect(data.preview[0].likelihood).toBe(1);
    expect(data.preview[0].impact).toBe(1);
    expect(data.preview[0].risk_level).toBe("Low"); // 1*1=1 < 6
  });

  it("throws when CSV has fewer than 2 rows", () => {
    expect(() =>
      handleImportRisks({ csv_content: "asset,threat,vulnerability,likelihood,impact" }),
    ).toThrow(McpError);
  });

  it("skips rows with errors when dry_run=false but only some rows are invalid", () => {
    // Note: the handler aborts entirely when errors > 0 && !dry_run
    const csv = [
      "asset,threat,vulnerability,likelihood,impact",
      "Good,Good,Good,3,3",
      ",Bad,Bad,3,3", // missing asset
    ].join("\n");
    const result = handleImportRisks({ csv_content: csv });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.valid_rows).toBe(1);
    expect(data.errors).toHaveLength(1);
  });

  it("risk_level thresholds: Low(<6), Medium(6-11), High(12-19), Critical(>=20)", () => {
    const csv = [
      "asset,threat,vulnerability,likelihood,impact",
      "A,T,V,1,1", // score 1 → Low
      "A,T,V,2,3", // score 6 → Medium
      "A,T,V,3,4", // score 12 → High
      "A,T,V,4,5", // score 20 → Critical
    ].join("\n");
    const result = handleImportRisks({ csv_content: csv, dry_run: true });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.preview[0].risk_level).toBe("Low");
    expect(data.preview[1].risk_level).toBe("Medium");
    expect(data.preview[2].risk_level).toBe("High");
    expect(data.preview[3].risk_level).toBe("Critical");
  });
});

// ── handleImportControlStatuses ───────────────────────────────

describe("handleImportControlStatuses", () => {
  it("dry_run=true returns preview without writing", () => {
    // First call: assessment lookup → returns ASSESSMENT_ROW
    // Subsequent calls: control_assessments lookup → returns a row (control exists)
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    const controlStmt    = { get: vi.fn().mockReturnValue({ id: "ca-1" }), run: vi.fn(), all: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessmentStmt)
      .mockReturnValue(controlStmt);

    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: VALID_STATUSES_CSV,
      dry_run: true,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dry_run).toBe(true);
    expect(data.valid_rows).toBe(2);
    expect(data.error_rows).toBe(0);
    expect(data.preview).toHaveLength(2);
    expect(data.preview[0].control_id).toBe("5.1");
    expect(data.preview[0].status).toBe("implemented");
  });

  it("updates rows when valid and dry_run=false", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    const controlStmt    = { get: vi.fn().mockReturnValue({ id: "ca-1" }), run: vi.fn(), all: vi.fn() };
    const updateStmt     = { get: vi.fn(), run: vi.fn(), all: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessmentStmt) // assessment lookup
      .mockReturnValueOnce(controlStmt)    // first control check
      .mockReturnValueOnce(controlStmt)    // second control check
      .mockReturnValue(updateStmt);        // UPDATE statement
    mockDb.transaction.mockImplementation((fn: (rows: unknown[]) => void) => fn);

    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: VALID_STATUSES_CSV,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(true);
    expect(data.updated).toBe(2);
    expect(data.skipped_rows).toBe(0);
  });

  it("throws McpError when assessment not found", () => {
    const notFoundStmt = { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(notFoundStmt);
    expect(() =>
      handleImportControlStatuses({
        assessment_id: "no-such-id",
        csv_content: VALID_STATUSES_CSV,
      }),
    ).toThrow(McpError);
  });

  it("throws McpError when assessment is archived", () => {
    const archivedStmt = {
      get: vi.fn().mockReturnValue({ ...ASSESSMENT_ROW, archived_at: "2025-01-01" }),
      run: vi.fn(), all: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(archivedStmt);
    expect(() =>
      handleImportControlStatuses({
        assessment_id: "assess-uuid-1",
        csv_content: VALID_STATUSES_CSV,
      }),
    ).toThrow(McpError);
  });

  it("returns error for invalid status value", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessmentStmt);
    const csv = [
      "control_id,status",
      "5.1,bad_status",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.errors[0].error).toMatch(/status must be one of/);
  });

  it("returns error when status=na and na_justification is missing", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessmentStmt);
    const csv = [
      "control_id,status",
      "5.1,na",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.errors[0].error).toMatch(/na_justification is required/);
  });

  it("accepts na with na_justification provided", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    const controlStmt    = { get: vi.fn().mockReturnValue({ id: "ca-1" }), run: vi.fn(), all: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessmentStmt)
      .mockReturnValue(controlStmt);
    const csv = [
      "control_id,status,na_justification",
      "5.1,na,Not applicable to our scope",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
      dry_run: true,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.valid_rows).toBe(1);
    expect(data.error_rows).toBe(0);
  });

  it("returns error when control_id is not in the assessment", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    const controlNotFoundStmt = { get: vi.fn().mockReturnValue(undefined), run: vi.fn(), all: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(assessmentStmt)
      .mockReturnValue(controlNotFoundStmt);
    const csv = [
      "control_id,status",
      "99.99,implemented",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.errors[0].error).toMatch(/not in assessment/);
  });

  it("dry_run=true with errors shows error count message variant", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessmentStmt);
    const csv = [
      "control_id,status",
      "5.1,bad_status",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
      dry_run: true,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dry_run).toBe(true);
    expect(data.message).toMatch(/have errors/);
  });

  it("returns error when control_id column is missing", () => {
    const assessmentStmt = { get: vi.fn().mockReturnValue(ASSESSMENT_ROW), run: vi.fn(), all: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessmentStmt);
    const csv = [
      "status,notes",
      "implemented,some note",
    ].join("\n");
    const result = handleImportControlStatuses({
      assessment_id: "assess-uuid-1",
      csv_content: csv,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.errors[0].error).toMatch(/control_id is required/);
  });
});
