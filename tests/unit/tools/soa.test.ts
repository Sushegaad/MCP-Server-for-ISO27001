/**
 * Unit tests for src/tools/soa.ts
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
  handleGenerateSoa,
  handleUpdateSoaEntry,
  handleExportSoa,
} from "../../../src/tools/soa.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const ASSESSMENT_ROW = {
  id: "assess-1",
  name: "2025 Assessment",
  exclude_controls: null,
  themes_in_scope: null,
};

const SOA_ROW = {
  id: "soa-1",
  assessment_id: "assess-1",
  isms_version: "2022",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const CONTROL_ROWS = [
  { control_id: "5.1", name: "Policies for IS", theme: "Organizational", description: "..." },
  { control_id: "5.2", name: "IS roles", theme: "Organizational", description: "..." },
];

const SOA_ENTRY_ROW = { id: "entry-1" };

// ── generate_soa ──────────────────────────────────────────────

describe("handleGenerateSoa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());
  });

  it("creates a new SoA and returns summary counts", () => {
    // prepare call order:
    // 1. SELECT gap_assessment
    // 2. SELECT existing SoA (none)
    // 3. INSERT soa
    // 4. SELECT controls
    // 5. SELECT control_statuses
    // 6. INSERT soa_entry (inside transaction)
    const assessStmt    = { get: vi.fn(() => ASSESSMENT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt  = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    const insertSoaStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const controlsStmt  = { get: vi.fn(), all: vi.fn(() => CONTROL_ROWS), run: vi.fn() };
    const statusesStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    const insertEntryStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt)
      .mockReturnValueOnce(insertSoaStmt)
      .mockReturnValueOnce(controlsStmt)
      .mockReturnValueOnce(statusesStmt)
      .mockReturnValueOnce(insertEntryStmt);

    const result = handleGenerateSoa({ assessment_id: "assess-1" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.assessment_id).toBe("assess-1");
    expect(data.isms_version).toBe("2022");
    expect(data.total_controls).toBe(2);
    expect(data.included).toBe(2);
    expect(data.excluded).toBe(0);
  });

  it("throws NOT_FOUND when gap_assessment does not exist", () => {
    const assessStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessStmt);

    expect(() => handleGenerateSoa({ assessment_id: "missing" })).toThrow(McpError);

    try {
      const s2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(s2);
      handleGenerateSoa({ assessment_id: "missing" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("throws BUSINESS_RULE when SoA already exists for this assessment", () => {
    const assessStmt   = { get: vi.fn(() => ASSESSMENT_ROW), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt = { get: vi.fn(() => ({ id: "soa-existing" })), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt);

    expect(() => handleGenerateSoa({ assessment_id: "assess-1" })).toThrow(McpError);

    try {
      const a2 = { get: vi.fn(() => ASSESSMENT_ROW), all: vi.fn(() => []), run: vi.fn() };
      const e2 = { get: vi.fn(() => ({ id: "soa-existing" })), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(a2).mockReturnValueOnce(e2);
      handleGenerateSoa({ assessment_id: "assess-1" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });

  it("respects excluded controls from the assessment", () => {
    const assessWithExclusion = { ...ASSESSMENT_ROW, exclude_controls: JSON.stringify(["5.1"]) };
    const assessStmt    = { get: vi.fn(() => assessWithExclusion), all: vi.fn(() => []), run: vi.fn() };
    const existingStmt  = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    const insertSoaStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const controlsStmt  = { get: vi.fn(), all: vi.fn(() => CONTROL_ROWS), run: vi.fn() };
    const statusesStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    const insertEntryStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(existingStmt)
      .mockReturnValueOnce(insertSoaStmt)
      .mockReturnValueOnce(controlsStmt)
      .mockReturnValueOnce(statusesStmt)
      .mockReturnValueOnce(insertEntryStmt);

    const result = handleGenerateSoa({ assessment_id: "assess-1" });
    const data = parseResult(result);

    // 5.1 is excluded, 5.2 is included
    expect(data.excluded).toBe(1);
    expect(data.included).toBe(1);
  });
});

// ── update_soa_entry ──────────────────────────────────────────

describe("handleUpdateSoaEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("updates an SoA entry and returns updated fields", () => {
    const soaStmt   = { get: vi.fn(() => { return { id: "soa-1" }; }), all: vi.fn(() => []), run: vi.fn() };
    const entryStmt = { get: vi.fn(() => SOA_ENTRY_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const updateSoaStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };

    mockDb.prepare
      .mockReturnValueOnce(soaStmt)
      .mockReturnValueOnce(entryStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(updateSoaStmt);

    const result = handleUpdateSoaEntry({
      soa_id: "soa-1",
      control_id: "5.1",
      included: true,
      justification: "In scope per ISMS boundary.",
      status: "implemented",
      responsible_party: "CISO",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.soa_id).toBe("soa-1");
    expect(data.control_id).toBe("5.1");
    expect(data.included).toBe(true);
    expect(data.status).toBe("implemented");
  });

  it("throws NOT_FOUND McpError for non-existent soa_id", () => {
    const soaStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(soaStmt);

    expect(() =>
      handleUpdateSoaEntry({
        soa_id: "missing",
        control_id: "5.1",
        included: true,
        justification: "test",
      }),
    ).toThrow(McpError);

    try {
      const s2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(s2);
      handleUpdateSoaEntry({ soa_id: "missing", control_id: "5.1", included: true, justification: "t" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("throws NOT_FOUND when soa_entry does not exist", () => {
    const soaStmt   = { get: vi.fn(() => { return { id: "soa-1" }; }), all: vi.fn(() => []), run: vi.fn() };
    const entryStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(soaStmt).mockReturnValueOnce(entryStmt);

    expect(() =>
      handleUpdateSoaEntry({
        soa_id: "soa-1",
        control_id: "9.9",
        included: false,
        justification: "not in scope",
      }),
    ).toThrow(McpError);
  });
});

// ── export_soa ────────────────────────────────────────────────

describe("handleExportSoa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  const ENTRY_ROWS = [
    {
      id: "entry-1",
      soa_id: "soa-1",
      control_id: "5.1",
      included: 1,
      justification: "In scope",
      status: "implemented",
      evidence_count: 0,
      responsible_party: "CISO",
      control_name: "Policies for IS",
      theme: "Organizational",
      description: "...",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "entry-2",
      soa_id: "soa-1",
      control_id: "5.2",
      included: 0,
      justification: "Excluded from scope",
      status: null,
      evidence_count: 0,
      responsible_party: null,
      control_name: "IS roles",
      theme: "Organizational",
      description: "...",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  it("exports SoA in markdown format", () => {
    const soaStmt     = { get: vi.fn(() => SOA_ROW), all: vi.fn(() => []), run: vi.fn() };
    const entriesStmt = { get: vi.fn(), all: vi.fn(() => ENTRY_ROWS), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(soaStmt).mockReturnValueOnce(entriesStmt);

    const result = handleExportSoa({ soa_id: "soa-1", format: "markdown" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.format).toBe("markdown");
    expect(data.content).toContain("# Statement of Applicability");
    expect(data.content).toContain("5.1");
    expect(data.content).toContain("Included Controls");
    expect(data.content).toContain("Excluded Controls");
  });

  it("exports SoA in csv format", () => {
    const soaStmt     = { get: vi.fn(() => SOA_ROW), all: vi.fn(() => []), run: vi.fn() };
    const entriesStmt = { get: vi.fn(), all: vi.fn(() => ENTRY_ROWS), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(soaStmt).mockReturnValueOnce(entriesStmt);

    const result = handleExportSoa({ soa_id: "soa-1", format: "csv" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.format).toBe("csv");
    expect(data.content).toContain("control_id,name,theme,included");
    expect(data.content).toContain("5.1");
  });

  it("throws NOT_FOUND for a non-existent soa_id", () => {
    const soaStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(soaStmt);

    expect(() => handleExportSoa({ soa_id: "missing", format: "markdown" })).toThrow(McpError);

    try {
      const s2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
      mockDb.prepare.mockReturnValueOnce(s2);
      handleExportSoa({ soa_id: "missing", format: "markdown" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });
});
