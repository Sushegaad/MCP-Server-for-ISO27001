/**
 * Unit tests for src/tools/controls.ts
 *
 * Tests: handleGetControl, handleListControls, handleSearchControls,
 *        handleGetControlAttributes, handleCompareVersions,
 *        handleGetClauseRequirement, handleListClauseRequirements
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
  handleGetControl,
  handleListControls,
  handleSearchControls,
  handleGetControlAttributes,
  handleCompareVersions,
  handleGetClauseRequirement,
  handleListClauseRequirements,
} from "../../../src/tools/controls.js";
import { McpError } from "../../../src/types/errors.js";

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseControlRow = {
  id: "uuid-1",
  control_id: "5.1",
  version: "2022",
  name: "Policies for information security",
  theme: "Organizational",
  description: "A test control description",
  guidance: null,
  control_type: '["Preventive"]',
  attributes: '{"cybersecurity_concepts":["Identify"]}',
  related_controls: '["5.2"]',
  new_in_2022: 0,
  iso_clause_refs: '["6.1"]',
  created_at: "2024-01-01T00:00:00Z",
};

const baseClauseRow = {
  id: "clause-uuid-1",
  clause_id: "6.1",
  parent_id: null,
  title: "Actions to address risks and opportunities",
  requirement_text: "The organisation shall...",
  implementation_notes: null,
  related_controls: '["5.1","5.2"]',
  created_at: "2024-01-01T00:00:00Z",
};

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
});

// ── handleGetControl ──────────────────────────────────────────────────────

describe("handleGetControl", () => {
  it("returns shaped control row when found by control_id and version", () => {
    mockStmt.get.mockReturnValue(baseControlRow);

    const result = handleGetControl({ control_id: "5.1", version: "2022" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.control_id).toBe("5.1");
    expect(data.version).toBe("2022");
    expect(Array.isArray(data.control_type)).toBe(true);
    expect(data.new_in_2022).toBe(false);
  });

  it("returns shaped control row when found without explicit version (ORDER BY fallback)", () => {
    mockStmt.get.mockReturnValue(baseControlRow);

    const result = handleGetControl({ control_id: "5.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.control_id).toBe("5.1");
  });

  it("throws NOT_FOUND McpError when control does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetControl({ control_id: "NONEXISTENT", version: "2022" })).toThrow(McpError);
    try {
      handleGetControl({ control_id: "NONEXISTENT", version: "2022" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleListControls ────────────────────────────────────────────────────

describe("handleListControls", () => {
  it("returns paginated controls with total on happy path (no filters)", () => {
    const countStmt = { get: vi.fn(() => ({ n: 93 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseControlRow]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListControls({ limit: 10, offset: 0 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(93);
    expect(data.controls).toHaveLength(1);
    expect(data.controls[0].control_id).toBe("5.1");
  });

  it("applies version and theme filters and returns matching controls", () => {
    const countStmt = { get: vi.fn(() => ({ n: 2 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseControlRow, { ...baseControlRow, control_id: "5.2" }]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(countStmt)
      .mockReturnValueOnce(rowsStmt);

    const result = handleListControls({ version: "2022", theme: "Organizational", limit: 50, offset: 0 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(2);
    expect(data.controls).toHaveLength(2);
  });
});

// ── handleSearchControls ──────────────────────────────────────────────────

describe("handleSearchControls", () => {
  it("returns FTS search results for a query", () => {
    mockStmt.all.mockReturnValue([baseControlRow]);

    const result = handleSearchControls({ query: "encryption", limit: 10, offset: 0 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.query).toBe("encryption");
    expect(data.count).toBe(1);
    expect(data.controls).toHaveLength(1);
  });

  it("returns empty results when no FTS matches", () => {
    mockStmt.all.mockReturnValue([]);

    const result = handleSearchControls({ query: "xyzzy", limit: 10 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(0);
    expect(data.controls).toHaveLength(0);
  });
});

// ── handleGetControlAttributes ────────────────────────────────────────────

describe("handleGetControlAttributes", () => {
  it("returns parsed attributes for a 2022 control", () => {
    mockStmt.get.mockReturnValue({
      control_id: "5.1",
      version: "2022",
      name: "Policies for information security",
      attributes: '{"cybersecurity_concepts":["Identify"],"operational_capabilities":["Governance"]}',
    });

    const result = handleGetControlAttributes({ control_id: "5.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.control_id).toBe("5.1");
    expect(data.attributes.cybersecurity_concepts).toContain("Identify");
  });

  it("throws NOT_FOUND McpError when control is missing or not in 2022", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetControlAttributes({ control_id: "A.1.1" })).toThrow(McpError);
    try {
      handleGetControlAttributes({ control_id: "A.1.1" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleCompareVersions ─────────────────────────────────────────────────

describe("handleCompareVersions", () => {
  it("returns enriched mapping rows for a v2022_id query", () => {
    const mappingRow = {
      id: "map-1",
      v2013_id: "A.5.1.1",
      v2022_id: "5.1",
      mapping_type: "equivalent",
      change_summary: "Merged",
      migration_notes: null,
    };
    const controlDetailStmt = { get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn() };
    // First prepare() is for mappings all(), then two prepare().get() calls for enrich
    const mappingStmt = { get: vi.fn(), all: vi.fn(() => [mappingRow]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(mappingStmt)      // SELECT mappings
      .mockReturnValueOnce(controlDetailStmt) // enrich v2013
      .mockReturnValueOnce(controlDetailStmt); // enrich v2022

    const result = handleCompareVersions({ v2022_id: "5.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.mappings).toHaveLength(1);
    expect(data.mappings[0].v2022_id).toBe("5.1");
  });

  it("throws NOT_FOUND McpError when no mappings found", () => {
    const emptyStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValue(emptyStmt);

    expect(() => handleCompareVersions({ v2022_id: "NONEXISTENT" })).toThrow(McpError);
    try {
      handleCompareVersions({ v2022_id: "NONEXISTENT" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleGetClauseRequirement ────────────────────────────────────────────

describe("handleGetClauseRequirement", () => {
  it("returns clause row with parsed related_controls", () => {
    mockStmt.get.mockReturnValue(baseClauseRow);

    const result = handleGetClauseRequirement({ clause_id: "6.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.clause_id).toBe("6.1");
    expect(Array.isArray(data.related_controls)).toBe(true);
    expect(data.related_controls).toContain("5.1");
  });

  it("returns sub_clauses when include_sub_clauses=true", () => {
    const subClause = { ...baseClauseRow, clause_id: "6.1.1", parent_id: "clause-uuid-1", id: "clause-uuid-2" };
    const mainStmt  = { get: vi.fn(() => baseClauseRow), all: vi.fn(() => []), run: vi.fn() };
    const subStmt   = { get: vi.fn(), all: vi.fn(() => [subClause]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(mainStmt)
      .mockReturnValueOnce(subStmt);

    const result = handleGetClauseRequirement({ clause_id: "6.1", include_sub_clauses: true });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.sub_clauses)).toBe(true);
    expect(data.sub_clauses).toHaveLength(1);
    expect(data.sub_clauses[0].clause_id).toBe("6.1.1");
  });

  it("throws NOT_FOUND McpError when clause does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetClauseRequirement({ clause_id: "99.99" })).toThrow(McpError);
    try {
      handleGetClauseRequirement({ clause_id: "99.99" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── handleListClauseRequirements ──────────────────────────────────────────

describe("handleListClauseRequirements", () => {
  it("returns top-level clauses when no parent_id given", () => {
    mockStmt.all.mockReturnValue([baseClauseRow]);

    const result = handleListClauseRequirements({});

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.clauses[0].clause_id).toBe("6.1");
  });

  it("returns child clauses for a given parent_id", () => {
    const parentRow   = { id: "clause-uuid-1" };
    const childClause = { ...baseClauseRow, clause_id: "6.1.1", parent_id: "clause-uuid-1" };
    const parentStmt  = { get: vi.fn(() => parentRow), all: vi.fn(() => []), run: vi.fn() };
    const childStmt   = { get: vi.fn(), all: vi.fn(() => [childClause]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(parentStmt)
      .mockReturnValueOnce(childStmt);

    const result = handleListClauseRequirements({ parent_id: "6.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.clauses[0].clause_id).toBe("6.1.1");
  });

  it("throws NOT_FOUND when parent_id does not resolve to a row", () => {
    const missingParentStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingParentStmt);

    expect(() => handleListClauseRequirements({ parent_id: "99.99" })).toThrow(McpError);
    try {
      handleListClauseRequirements({ parent_id: "99.99" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});

// ── Additional branch-coverage tests ─────────────────────────────────────

describe("handleListControls — new_in_2022 / control_type / cybersecurity_concept filters", () => {
  it("applies new_in_2022=true filter", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [{ ...baseControlRow, new_in_2022: 1 }]), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListControls({ new_in_2022: true });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);
    expect(data.controls[0].new_in_2022).toBe(true);
  });

  it("applies control_type filter", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseControlRow]), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListControls({ control_type: "Preventive" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);
  });

  it("applies cybersecurity_concept filter", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => [baseControlRow]), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListControls({ cybersecurity_concept: "Identify" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(1);
  });
});

describe("handleSearchControls — version filter branch", () => {
  it("applies version filter to FTS query", () => {
    mockStmt.all.mockReturnValue([baseControlRow]);

    const result = handleSearchControls({ query: "policy", version: "2022", limit: 10 });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
  });
});

describe("handleCompareVersions — additional query branches", () => {
  it("queries with both v2022_id and v2013_id when both are supplied", () => {
    const mappingRow = {
      id: "map-1", v2013_id: "A.5.1.1", v2022_id: "5.1",
      mapping_type: "equivalent", change_summary: "Merged", migration_notes: null,
    };
    const mappingStmt       = { get: vi.fn(), all: vi.fn(() => [mappingRow]), run: vi.fn() };
    const controlDetailStmt = { get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce(mappingStmt)
      .mockReturnValueOnce(controlDetailStmt) // enrich v2013
      .mockReturnValueOnce(controlDetailStmt); // enrich v2022

    const result = handleCompareVersions({ v2022_id: "5.1", v2013_id: "A.5.1.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.mappings).toHaveLength(1);
  });

  it("queries with v2013_id only when v2022_id is absent", () => {
    const mappingRow = {
      id: "map-2", v2013_id: "A.5.1.1", v2022_id: null,
      mapping_type: "removed", change_summary: null, migration_notes: null,
    };
    const mappingStmt       = { get: vi.fn(), all: vi.fn(() => [mappingRow]), run: vi.fn() };
    const controlDetailStmt = { get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn() };
    // enrich(null, "2022") returns null immediately — prepare is only called once for v2013
    mockDb.prepare
      .mockReturnValueOnce(mappingStmt)
      .mockReturnValueOnce(controlDetailStmt); // enrich v2013 only

    const result = handleCompareVersions({ v2013_id: "A.5.1.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.mappings[0].v2022_details).toBeNull();
  });
});

describe("handleGetControlAttributes — null attributes branch", () => {
  it("returns empty attributes object when row.attributes is null", () => {
    mockStmt.get.mockReturnValue({
      control_id: "5.1",
      version: "2022",
      name: "Policies for IS",
      attributes: null,
    });

    const result = handleGetControlAttributes({ control_id: "5.1" });

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.attributes).toEqual({});
  });
});
