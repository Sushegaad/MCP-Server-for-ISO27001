/**
 * Unit tests for src/tools/procedures.ts
 *
 * Covers: handleCreateProcedure, handleGetProcedure, handleListProcedures,
 *         handleUpdateProcedure, handleExportProcedure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mock stubs ───────────────────────────────────

// Mock node:fs so loadTemplate() doesn't require real template files
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(
    () =>
      `---\nclause_mappings: ['6.1.2','9.1']\ncontrol_mappings: ['5.15','5.16']\n---\n# {{organisation_name}} Procedure\n\nScope: {{scope}}\nOwner: {{owner}}\nVersion: {{version}}\nParent Policy: {{parent_policy_id}}\n`,
  ),
}));

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

// Mock loadOrgProfileDefaults so tests that provide org_name/scope don't need a real profile
vi.mock("../../../src/tools/org-profile.js", () => ({
  loadOrgProfileDefaults: vi.fn(() => null),
}));

// ── SUT imports (after vi.mock) ───────────────────────────────

import { readFileSync } from "node:fs";
import {
  handleCreateProcedure,
  handleGetProcedure,
  handleListProcedures,
  handleUpdateProcedure,
  handleExportProcedure,
} from "../../../src/tools/procedures.js";
import { loadOrgProfileDefaults } from "../../../src/tools/org-profile.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const BASE_PROCEDURE_ROW = {
  id:                  "proc-1",
  procedure_type:      "access_provisioning",
  policy_id:           null,
  organisation_name:   "Acme Ltd",
  scope:               "All IT systems",
  owner:               "CISO",
  approver:            "CEO",
  status:              "draft",
  version:             1,
  content:             "# Acme Ltd Procedure\n\nScope: All IT systems\nOwner: CISO\n",
  clause_mappings:     '["6.1.2","9.1"]',
  control_mappings:    '["5.15","5.16"]',
  related_controls:    '["5.15","5.16"]',
  review_cycle_months: 12,
  effective_date:      "2025-01-01",
  next_review_date:    "2026-01-01",
  reviewed_by:         null,
  approved_by:         null,
  created_at:          "2025-01-01T00:00:00Z",
  updated_at:          "2025-01-01T00:00:00Z",
};

// ── handleCreateProcedure ─────────────────────────────────────

describe("handleCreateProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockStmt.run.mockReturnValue({ changes: 1 });
    // policy lookup (for policy_id validation) — not called when policy_id omitted
    mockStmt.get.mockReturnValue(undefined);
    vi.mocked(loadOrgProfileDefaults).mockReturnValue(null);
  });

  it("creates a procedure and returns a preview", () => {
    const result = handleCreateProcedure({
      type:              "access_provisioning",
      organisation_name: "Acme Ltd",
      scope:             "All IT systems",
      owner:             "CISO",
      effective_date:    "2025-01-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.procedure_type).toBe("access_provisioning");
    expect(data.organisation_name).toBe("Acme Ltd");
    expect(data.version).toBe(1);
    expect(data.status).toBe("draft");
    expect(typeof data.content_preview).toBe("string");
    expect(data.clause_mappings).toContain("6.1.2");
    expect(data.control_mappings).toContain("5.15");
  });

  it("calls readFileSync to load the template", () => {
    handleCreateProcedure({
      type:              "access_provisioning",
      organisation_name: "Acme Ltd",
      scope:             "All IT systems",
      owner:             "CISO",
      effective_date:    "2025-01-01",
    });

    expect(readFileSync).toHaveBeenCalled();
  });

  it("uses org profile defaults when organisation_name is omitted", () => {
    vi.mocked(loadOrgProfileDefaults).mockReturnValue({
      organisation_name: "Profile Ltd",
      scope:             "Profile scope",
    });

    const result = handleCreateProcedure({
      type:           "access_provisioning",
      owner:          "CISO",
      effective_date: "2025-01-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.organisation_name).toBe("Profile Ltd");
  });

  it("throws BUSINESS_RULE when organisation_name missing and no org profile", () => {
    vi.mocked(loadOrgProfileDefaults).mockReturnValue(null);

    expect(() =>
      handleCreateProcedure({
        type:           "access_provisioning",
        owner:          "CISO",
        effective_date: "2025-01-01",
        // no organisation_name, no scope
      }),
    ).toThrow(McpError);

    try {
      handleCreateProcedure({
        type:           "access_provisioning",
        owner:          "CISO",
        effective_date: "2025-01-01",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("throws NOT_FOUND when policy_id does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleCreateProcedure({
        type:              "access_provisioning",
        organisation_name: "Acme Ltd",
        scope:             "All systems",
        owner:             "CISO",
        effective_date:    "2025-01-01",
        policy_id:         "00000000-0000-4000-8000-000000000099",
      }),
    ).toThrow(McpError);
  });

  it("throws BUSINESS_RULE when linked policy is archived", () => {
    mockStmt.get.mockReturnValue({ id: "pol-1", status: "archived" });

    expect(() =>
      handleCreateProcedure({
        type:              "access_provisioning",
        organisation_name: "Acme Ltd",
        scope:             "All systems",
        owner:             "CISO",
        effective_date:    "2025-01-01",
        policy_id:         "pol-1",
      }),
    ).toThrow(McpError);

    try {
      mockStmt.get.mockReturnValue({ id: "pol-1", status: "archived" });
      handleCreateProcedure({
        type:              "access_provisioning",
        organisation_name: "Acme Ltd",
        scope:             "All systems",
        owner:             "CISO",
        effective_date:    "2025-01-01",
        policy_id:         "pol-1",
      });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("stores policy_id when linked policy is active", () => {
    mockStmt.get.mockReturnValue({ id: "pol-1", status: "active" });
    mockStmt.run.mockReturnValue({ changes: 1 });

    const result = handleCreateProcedure({
      type:              "access_provisioning",
      organisation_name: "Acme Ltd",
      scope:             "All systems",
      owner:             "CISO",
      effective_date:    "2025-01-01",
      policy_id:         "pol-1",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.policy_id).toBe("pol-1");
  });

  it("stores related_controls when provided", () => {
    const result = handleCreateProcedure({
      type:              "access_provisioning",
      organisation_name: "Acme Ltd",
      scope:             "All systems",
      owner:             "CISO",
      effective_date:    "2025-01-01",
      related_controls:  ["5.15", "5.16"],
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.related_controls).toContain("5.15");
  });
});

// ── handleGetProcedure ────────────────────────────────────────

describe("handleGetProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns the procedure row when found", () => {
    mockStmt.get.mockReturnValue(BASE_PROCEDURE_ROW);

    const result = handleGetProcedure({ procedure_id: "proc-1" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("proc-1");
    expect(Array.isArray(data.clause_mappings)).toBe(true);
    expect(data.clause_mappings).toContain("6.1.2");
    expect(Array.isArray(data.related_controls)).toBe(true);
  });

  it("throws McpError (NOT_FOUND) when procedure does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetProcedure({ procedure_id: "missing" })).toThrow(McpError);
    expect(() => handleGetProcedure({ procedure_id: "missing" })).toThrow(/not found/i);
  });

  it("returns versions array when include_versions=true", () => {
    const versionStmt = {
      get: vi.fn(() => BASE_PROCEDURE_ROW),
      all: vi.fn(() => [{ id: "v1", version: 1, change_summary: "initial", reviewed_by: null, archived_at: "2025-06-01" }]),
      run: vi.fn(),
    };
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => BASE_PROCEDURE_ROW), all: vi.fn(() => []), run: vi.fn() })
      .mockReturnValueOnce(versionStmt);

    const result = handleGetProcedure({ procedure_id: "proc-1", include_versions: true });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(Array.isArray(data.versions)).toBe(true);
    expect(data.versions).toHaveLength(1);
  });
});

// ── handleListProcedures ──────────────────────────────────────

describe("handleListProcedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns paginated procedures with enriched fields", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ ...BASE_PROCEDURE_ROW, next_review_date: "2099-12-31" }]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({});

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(Array.isArray(data.procedures)).toBe(true);
  });

  it("marks a procedure with past next_review_date as overdue", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ ...BASE_PROCEDURE_ROW, next_review_date: "2020-01-01" }]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({});
    const data = parseResult(result);
    const procedure = data.procedures[0];

    expect(procedure.overdue).toBe(true);
    expect(procedure.days_until_review).toBeLessThan(0);
  });

  it("applies procedure_type filter when provided", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ ...BASE_PROCEDURE_ROW, next_review_date: "2099-12-31" }]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({ procedure_type: "access_provisioning" });
    expect(result.isError).toBe(false);
  });

  it("applies policy_id filter when provided", () => {
    const countStmt = { get: vi.fn(() => ({ n: 0 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({ policy_id: "00000000-0000-4000-8000-000000000001" });
    const data = parseResult(result);
    expect(data.total).toBe(0);
  });

  it("applies overdue_only filter (adds status=active condition)", () => {
    const countStmt = { get: vi.fn(() => ({ n: 0 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({ overdue_only: true });
    expect(result.isError).toBe(false);
  });

  it("returns empty list when no procedures match", () => {
    const countStmt = { get: vi.fn(() => ({ n: 0 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListProcedures({ status: "archived" });
    const data = parseResult(result);
    expect(data.total).toBe(0);
    expect(data.procedures).toHaveLength(0);
  });
});

// ── handleUpdateProcedure ─────────────────────────────────────

describe("handleUpdateProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("archives the old version and increments version number", () => {
    const getStmt     = { get: vi.fn(() => BASE_PROCEDURE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const archiveStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const updateStmt  = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(getStmt)
      .mockReturnValueOnce(archiveStmt)
      .mockReturnValueOnce(updateStmt);

    const result = handleUpdateProcedure({
      procedure_id:   "proc-1",
      scope:          "Updated scope",
      owner:          "CTO",
      reviewed_by:    "auditor@example.com",
      change_summary: "Scope revised",
      confirmed:      true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("proc-1");
    expect(data.version).toBe(2);
    expect(data.reviewed_by).toBe("auditor@example.com");
  });

  it("throws McpError (NOT_FOUND) when procedure does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleUpdateProcedure({
        procedure_id:   "missing",
        reviewed_by:    "auditor",
        change_summary: "test",
      }),
    ).toThrow(McpError);
  });

  it("throws McpError (BUSINESS_RULE) for archived procedure", () => {
    mockStmt.get.mockReturnValue({ ...BASE_PROCEDURE_ROW, status: "archived" });

    expect(() =>
      handleUpdateProcedure({
        procedure_id:   "proc-1",
        reviewed_by:    "auditor",
        change_summary: "test",
      }),
    ).toThrow(McpError);

    try {
      mockStmt.get.mockReturnValue({ ...BASE_PROCEDURE_ROW, status: "archived" });
      handleUpdateProcedure({ procedure_id: "proc-1", reviewed_by: "a", change_summary: "b" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("falls back to current scope and owner when not supplied", () => {
    const getStmt     = { get: vi.fn(() => BASE_PROCEDURE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const archiveStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const updateStmt  = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(getStmt)
      .mockReturnValueOnce(archiveStmt)
      .mockReturnValueOnce(updateStmt);

    const result = handleUpdateProcedure({
      procedure_id:   "proc-1",
      reviewed_by:    "auditor@example.com",
      change_summary: "Minor cleanup",
      confirmed:      true,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.version).toBe(2);
  });

  it("preview (confirmed omitted): returns hitl_proposed with diff including array-formatted related_controls", () => {
    const getStmt = { get: vi.fn(() => BASE_PROCEDURE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(getStmt);

    // Pass related_controls (non-empty array) → diff row old is parsed array → covers Array.isArray in formatVal
    const result = handleUpdateProcedure({
      procedure_id:    "proc-1",
      related_controls: ["5.15"],
      reviewed_by:     "auditor@example.com",
      change_summary:  "Preview test",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.procedure_id).toBe("proc-1");
    expect(typeof data.diff).toBe("string");
    // The diff should render related_controls as a backtick-array
    expect(data.diff).toContain("related_controls");
  });

  it("preview (confirmed omitted): empty related_controls renders as `[]`", () => {
    const getStmt = { get: vi.fn(() => BASE_PROCEDURE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(getStmt);

    // Pass empty array → formatVal([]) → items.length === 0 → "`[]`"
    const result = handleUpdateProcedure({
      procedure_id:    "proc-1",
      related_controls: [],
      reviewed_by:     "auditor@example.com",
      change_summary:  "Empty controls preview",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.diff).toContain("`[]`");
  });
});

// ── handleExportProcedure ─────────────────────────────────────

describe("handleExportProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws McpError (NOT_FOUND) when procedure does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleExportProcedure({ procedure_id: "missing", format: "markdown" }),
    ).toThrow(McpError);
  });

  it("exports as markdown with content field", () => {
    mockStmt.get.mockReturnValue(BASE_PROCEDURE_ROW);

    const result = handleExportProcedure({ procedure_id: "proc-1", format: "markdown" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.format).toBe("markdown");
    expect(typeof data.content).toBe("string");
    expect(data.content).toContain("Acme Ltd");
  });

  it("appends related controls section to markdown when controls present", () => {
    mockStmt.get.mockReturnValue(BASE_PROCEDURE_ROW);

    const result = handleExportProcedure({ procedure_id: "proc-1", format: "markdown" });
    const data = parseResult(result);

    expect(data.content).toContain("Related Controls");
    expect(data.content).toContain("5.15");
  });

  it("exports as JSON with parsed array fields", () => {
    mockStmt.get.mockReturnValue(BASE_PROCEDURE_ROW);

    const result = handleExportProcedure({ procedure_id: "proc-1", format: "json" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.format).toBe("json");
    expect(data.procedure).toBeDefined();
    expect(Array.isArray(data.procedure.clause_mappings)).toBe(true);
    expect(Array.isArray(data.procedure.control_mappings)).toBe(true);
    expect(Array.isArray(data.procedure.related_controls)).toBe(true);
    expect(data.procedure.related_controls).toContain("5.15");
  });

  it("exports as markdown without controls section when related_controls is null", () => {
    mockStmt.get.mockReturnValue({ ...BASE_PROCEDURE_ROW, related_controls: null });

    const result = handleExportProcedure({ procedure_id: "proc-1", format: "markdown" });
    const data = parseResult(result);

    expect(data.format).toBe("markdown");
    expect(data.content).not.toContain("Related Controls");
  });
});
