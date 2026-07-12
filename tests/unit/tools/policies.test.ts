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
import { _testSeedProposal } from "../../../src/tools/hitl-utils.js";

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

  it("returns HITL preview when confirmed is omitted", () => {
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
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.policy_type).toBe("information_security");
    expect(data.diff).toContain("type");
    // No INSERT should have been called
    expect(mockStmt.run).not.toHaveBeenCalled();
  });

  it("creates a policy and returns content_preview when confirmed=true", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    const PROPOSAL_CP_1 = "a1a1a1a1-a1a1-4a1a-aa1a-a1a1a1a1a1a1";
    _testSeedProposal(PROPOSAL_CP_1, "create_policy");

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      review_cycle_months: 12,
      confirmed: true,
      proposal_id: PROPOSAL_CP_1,
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

  it("calls readFileSync to load the template when confirmed=true", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    const PROPOSAL_CP_2 = "b2b2b2b2-b2b2-4b2b-ab2b-b2b2b2b2b2b2";
    _testSeedProposal(PROPOSAL_CP_2, "create_policy");

    handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_CP_2,
    });

    expect(readFileSync).toHaveBeenCalled();
  });

  it("inserts the policy into the database via prepare().run() when confirmed=true", () => {
    mockStmt.run.mockReturnValue({ changes: 1 });

    const PROPOSAL_CP_3 = "c3c3c3c3-c3c3-4c3c-ac3c-c3c3c3c3c3c3";
    _testSeedProposal(PROPOSAL_CP_3, "create_policy");

    handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_CP_3,
    });

    // prepare is called twice: once by loadOrgProfileDefaults() and once for the INSERT
    expect(mockDb.prepare).toHaveBeenCalledTimes(2);
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

    const PROPOSAL_UP_1 = "d4d4d4d4-d4d4-4d4d-ad4d-d4d4d4d4d4d4";
    _testSeedProposal(PROPOSAL_UP_1, "update_policy");

    const result = handleUpdatePolicy({
      policy_id: "pol-1",
      scope: "Updated scope",
      owner: "CTO",
      reviewed_by: "auditor@example.com",
      change_summary: "Scope revised",
      confirmed: true,
      proposal_id: PROPOSAL_UP_1,
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

  it("returns empty clause/control mappings when template has no frontmatter (confirmed=true)", () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      "# {{organisation_name}} Policy\n\nScope: {{scope}}\nOwner: {{owner}}\n",
    );
    mockStmt.run.mockReturnValue({ changes: 1 });

    const PROPOSAL_CP_4 = "e5e5e5e5-e5e5-4e5e-ae5e-e5e5e5e5e5e5";
    _testSeedProposal(PROPOSAL_CP_4, "create_policy");

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_CP_4,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.clause_mappings).toHaveLength(0);
    expect(data.control_mappings).toHaveLength(0);
  });

  it("returns empty mappings when frontmatter has no clause/control_mappings keys (confirmed=true)", () => {
    // Frontmatter is present but doesn't define the expected keys →
    // clauseMatch and controlMatch will both be null (covers if(clauseMatch)=false branch)
    vi.mocked(readFileSync).mockReturnValueOnce(
      "---\ntitle: Test Policy\n---\n# {{organisation_name}} Policy\n\nScope: {{scope}}\n",
    );
    mockStmt.run.mockReturnValue({ changes: 1 });

    const PROPOSAL_CP_5 = "f6f6f6f6-f6f6-4f6f-af6f-f6f6f6f6f6f6";
    _testSeedProposal(PROPOSAL_CP_5, "create_policy");

    const result = handleCreatePolicy({
      type: "information_security",
      organisation_name: "Acme Ltd",
      scope: "All IT systems",
      owner: "CISO",
      effective_date: "2025-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_CP_5,
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
    const PROPOSAL_UP_2 = "a7a7a7a7-a7a7-4a7a-aa7a-a7a7a7a7a7a7";
    _testSeedProposal(PROPOSAL_UP_2, "update_policy");

    const result = handleUpdatePolicy({
      policy_id: "pol-1",
      reviewed_by: "auditor@example.com",
      change_summary: "Minor text cleanup",
      confirmed: true,
      proposal_id: PROPOSAL_UP_2,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("pol-1");
    expect(data.version).toBe(2);
  });

  it("preview (confirmed omitted): returns hitl_proposed with diff table showing version bump", () => {
    const getStmt = { get: vi.fn(() => BASE_POLICY_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(getStmt);

    // No confirmed → preview only
    const result = handleUpdatePolicy({
      policy_id:      "pol-1",
      scope:          "Updated scope",
      owner:          "CTO",
      reviewed_by:    "auditor@example.com",
      change_summary: "Preview test",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.policy_id).toBe("pol-1");
    expect(typeof data.diff).toBe("string");
    expect(data.diff).toContain("version");
  });
});
