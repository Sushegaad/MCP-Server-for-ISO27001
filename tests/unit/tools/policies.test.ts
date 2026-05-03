/**
 * Unit tests for src/tools/policies.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mock stubs ───────────────────────────────────

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(
    () =>
      `---\nclause_mappings: ['6.1','6.2']\ncontrol_mappings: ['5.1']\n---\n# {{organisation_name}} Policy\n\nScope: {{scope}}\nOwner: {{owner}}\n`,
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

// ── SUT imports (after vi.mock) ───────────────────────────────

import { readFileSync } from "node:fs";
import {
  handleCreatePolicy,
  handleGetPolicy,
  handleUpdatePolicy,
  handleListPolicies,
} from "../../../src/tools/policies.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const BASE_POLICY_ROW = {
  id: "pol-1",
  type: "information_security",
  organisation_name: "Acme Ltd",
  scope: "All IT systems",
  owner: "CISO",
  approver: "CEO",
  status: "draft",
  version: 1,
  content: "# Acme Ltd Policy\n\nScope: All IT systems\nOwner: CISO\n",
  clause_mappings: '["6.1","6.2"]',
  control_mappings: '["5.1"]',
  review_cycle_months: 12,
  effective_date: "2025-01-01",
  next_review_date: "2026-01-01",
  reviewed_by: null,
  approved_by: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── Tests ─────────────────────────────────────────────────────

describe("handleCreatePolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("creates a policy and returns a preview", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      review_cycle_months: 12,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.type).toBe("information_security");
    expect(data.organisation_name).toBe("Acme Ltd");
    expect(data.version).toBe(1);
    expect(data.status).toBe("draft");
    expect(data.clause_mappings).toContain("6.1");
    expect(data.control_mappings).toContain("5.1");
    expect(typeof data.content_preview).toBe("string");
  });

  it("calls readFileSync to load the template", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
    });

    expect(readFileSync).toHaveBeenCalled();
  });

  it("inserts the policy into the database via prepare().run()", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
    });

    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    expect(mockStmt.run).toHaveBeenCalledTimes(1);
  });
});

describe("handleGetPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns the policy row when found", () => {
    mockStmt.get.mockReturnValue(BASE_POLICY_ROW);

    const result = handleGetPolicy({ policy_id: "pol-1" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("pol-1");
    expect(Array.isArray(data.clause_mappings)).toBe(true);
    expect(data.clause_mappings).toContain("6.1");
  });

  it("throws McpError (NOT_FOUND) when policy does not exist", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetPolicy({ policy_id: "missing" })).toThrow(McpError);
    expect(() => handleGetPolicy({ policy_id: "missing" })).toThrow(/not found/i);
  });

  it("returns versions array when include_versions=true", () => {
    const versionStmt = { get: vi.fn(() => BASE_POLICY_ROW), all: vi.fn(() => [{ id: "v1", version: 1, change_summary: "initial", reviewed_by: null, archived_at: "2025-06-01" }]), run: vi.fn() };
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => BASE_POLICY_ROW), all: vi.fn(() => []), run: vi.fn() })
      .mockReturnValueOnce(versionStmt);

    const result = handleGetPolicy({ policy_id: "pol-1", include_versions: true });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(Array.isArray(data.versions)).toBe(true);
    expect(data.versions).toHaveLength(1);
  });
});

describe("handleUpdatePolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("archives the old version and updates the policy", () => {
    const getStmt    = { get: vi.fn(() => BASE_POLICY_ROW), all: vi.fn(() => []), run: vi.fn() };
    const archiveStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const updateStmt  = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(getStmt)
      .mockReturnValueOnce(archiveStmt)
      .mockReturnValueOnce(updateStmt);

    const result = handleUpdatePolicy({
      policy_id: "pol-1",
      scope: "Updated scope",
      owner: "CTO",
      reviewed_by: "auditor@example.com",
      change_summary: "Scope revised",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("pol-1");
    expect(data.version).toBe(2);
    expect(data.reviewed_by).toBe("auditor@example.com");
  });

  it("throws McpError when policy not found", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleUpdatePolicy({
        policy_id: "missing",
        reviewed_by: "auditor",
        change_summary: "test",
      }),
    ).toThrow(McpError);
  });

  it("throws McpError for archived policy (cannot update archived)", () => {
    const archivedRow = { ...BASE_POLICY_ROW, status: "archived" };
    mockStmt.get.mockReturnValue(archivedRow);

    expect(() =>
      handleUpdatePolicy({
        policy_id: "pol-1",
        reviewed_by: "auditor",
        change_summary: "test",
      }),
    ).toThrow(McpError);

    try {
      mockStmt.get.mockReturnValue(archivedRow);
      handleUpdatePolicy({ policy_id: "pol-1", reviewed_by: "a", change_summary: "b" });
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
    }
  });
});

describe("handleListPolicies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns paginated policies with enriched fields", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = {
      get: vi.fn(),
      all: vi.fn(() => [
        { ...BASE_POLICY_ROW, next_review_date: "2099-12-31" },
      ]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({});

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(Array.isArray(data.policies)).toBe(true);
  });

  it("marks a policy with past next_review_date as overdue", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = {
      get: vi.fn(),
      all: vi.fn(() => [
        { ...BASE_POLICY_ROW, next_review_date: "2020-01-01" },
      ]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({});
    const data = parseResult(result);
    const policy = data.policies[0];

    expect(policy.overdue).toBe(true);
    expect(policy.days_until_review).toBeLessThan(0);
  });

  it("marks a policy with future next_review_date as not overdue", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = {
      get: vi.fn(),
      all: vi.fn(() => [
        { ...BASE_POLICY_ROW, next_review_date: "2099-12-31" },
      ]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({});
    const data = parseResult(result);
    const policy = data.policies[0];

    expect(policy.overdue).toBe(false);
    expect(policy.days_until_review).toBeGreaterThan(0);
  });

  it("returns empty list when no policies match", () => {
    const countStmt = { get: vi.fn(() => ({ n: 0 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({ status: "published" });
    const data = parseResult(result);

    expect(data.total).toBe(0);
    expect(data.policies).toHaveLength(0);
  });
});

// ── Additional branch-coverage tests ─────────────────────────

describe("handleCreatePolicy — template branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns empty clause/control mappings when template has no frontmatter", () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      "# {{organisation_name}} Policy\n\nScope: {{scope}}\nOwner: {{owner}}\n",
    );
    mockStmt.run.mockReturnValue({ changes: 1 });

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.clause_mappings).toHaveLength(0);
    expect(data.control_mappings).toHaveLength(0);
  });

  it("returns empty mappings when frontmatter has no clause/control_mappings keys", () => {
    // Frontmatter is present but doesn't define the expected keys →
    // clauseMatch and controlMatch will both be null (covers if(clauseMatch)=false branch)
    vi.mocked(readFileSync).mockReturnValueOnce(
      "---\ntitle: Test Policy\n---\n# {{organisation_name}} Policy\n\nScope: {{scope}}\n",
    );
    mockStmt.run.mockReturnValue({ changes: 1 });

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.clause_mappings).toHaveLength(0);
    expect(data.control_mappings).toHaveLength(0);
  });
});

describe("handleListPolicies — additional filter branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("applies type filter when provided", () => {
    const countStmt = { get: vi.fn(() => ({ n: 1 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = {
      get: vi.fn(),
      all: vi.fn(() => [{ ...BASE_POLICY_ROW, next_review_date: "2099-12-31" }]),
      run: vi.fn(),
    };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({ type: "information_security" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.total).toBe(1);
  });

  it("applies owner and overdue_only filters", () => {
    const countStmt = { get: vi.fn(() => ({ n: 0 })), all: vi.fn(() => []), run: vi.fn() };
    const rowsStmt  = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(rowsStmt);

    const result = handleListPolicies({ owner: "CISO", overdue_only: true });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.total).toBe(0);
    expect(data.policies).toHaveLength(0);
  });
});

describe("handleUpdatePolicy — no scope/owner provided", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("falls back to current scope and owner when not supplied", () => {
    const getStmt     = { get: vi.fn(() => BASE_POLICY_ROW), all: vi.fn(() => []), run: vi.fn() };
    const archiveStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const updateStmt  = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(getStmt)
      .mockReturnValueOnce(archiveStmt)
      .mockReturnValueOnce(updateStmt);

    // scope and owner deliberately omitted → handler uses current.scope / current.owner
    const result = handleUpdatePolicy({
      policy_id: "pol-1",
      reviewed_by: "auditor@example.com",
      change_summary: "Minor text cleanup",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("pol-1");
    expect(data.version).toBe(2);
  });
});
