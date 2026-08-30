/**
 * Unit tests for src/tools/evidence-tracking.ts
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

// Mock getEnv — returns empty strings for integration-related env vars by default.
// Individual tests can override via vi.mocked(getEnv).mockImplementation(...).
vi.mock("../../../src/security/secrets.js", () => ({
  getEnv: vi.fn((key: string, defaultVal: string) => {
    // Return empty string for known integration keys to trigger INTEGRATION_ERROR
    const integrationKeys = [
      "JIRA_BASE_URL",
      "JIRA_API_TOKEN",
      "JIRA_PROJECT_KEY",
      "GITHUB_TOKEN",
      "GITHUB_REPO",
    ];
    if (integrationKeys.includes(key)) return "";
    return defaultVal;
  }),
}));

// ── SUT imports (after vi.mock) ───────────────────────────────

import {
  handleRegisterEvidence,
  handleListEvidence,
  handleGetEvidenceGaps,
  handleLinkJiraTicket,
  handleLinkGithubIssue,
  handleVerifyEvidence,
} from "../../../src/tools/evidence-tracking.js";
import { McpError } from "../../../src/types/errors.js";
import { getEnv } from "../../../src/security/secrets.js";
import { _testSeedProposal } from "../../../src/tools/hitl-utils.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const EVIDENCE_ROW = {
  id: "ev-1",
  control_id: "5.1",
  type: "policy",
  description: "Information Security Policy document",
  source_url: "https://example.com/policy.pdf",
  collected_by: "auditor@example.com",
  collected_date: "2025-01-01",
  expiry_date: "2026-01-01",
  jira_key: null,
  jira_url: null,
  github_issue_url: null,
  github_issue_number: null,
  content_sha256: null,
  source_system: null,
  source_object_id: null,
  source_revision: null,
  captured_at: null,
  period_start: null,
  period_end: null,
  reviewer: null,
  verification_status: "unverified",
  verification_date: null,
  sufficiency: null,
  assertion: null,
  supersedes_evidence_id: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── register_evidence ─────────────────────────────────────────

describe("handleRegisterEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns HITL preview when confirmed is omitted", () => {
    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Information Security Policy document",
      collected_by: "auditor@example.com",
      collected_date: "2025-01-01",
      expiry_date: "2026-01-01",
      source_url: "https://example.com/policy.pdf",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.diff).toContain("control_id");
    // No DB calls at all when previewing
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it("registers evidence and returns row with computed status when confirmed=true", () => {
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const PROPOSAL_RE_1 = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
    _testSeedProposal(PROPOSAL_RE_1, "register_evidence");

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Information Security Policy document",
      collected_by: "auditor@example.com",
      collected_date: "2025-01-01",
      expiry_date: "2026-01-01",
      source_url: "https://example.com/policy.pdf",
      confirmed: true,
      proposal_id: PROPOSAL_RE_1,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("ev-1");
    expect(data.control_id).toBe("5.1");
    expect(typeof data.status).toBe("string");
    // Expiry is in the future so status should be current or stale
    expect(["current", "stale", "expired"]).toContain(data.status);
  });

  it("returns 'expired' status when expiry_date is in the past (confirmed=true)", () => {
    const expiredRow = { ...EVIDENCE_ROW, expiry_date: "2020-01-01" };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => expiredRow), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const PROPOSAL_RE_2 = "ffffffff-ffff-4fff-afff-ffffffffffff";
    _testSeedProposal(PROPOSAL_RE_2, "register_evidence");

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Old policy",
      collected_by: "auditor",
      collected_date: "2020-01-01",
      expiry_date: "2020-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_RE_2,
    });

    const data = parseResult(result);
    expect(data.status).toBe("expired");
  });

  it("returns 'current' status when no expiry_date is set (confirmed=true)", () => {
    const noExpiryRow = { ...EVIDENCE_ROW, expiry_date: null };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => noExpiryRow), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const PROPOSAL_RE_3 = "cccccccc-cccc-4ccc-accc-cccccccccccc";
    _testSeedProposal(PROPOSAL_RE_3, "register_evidence");

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Policy no expiry",
      collected_by: "auditor",
      collected_date: "2025-01-01",
      confirmed: true,
      proposal_id: PROPOSAL_RE_3,
    });

    const data = parseResult(result);
    expect(data.status).toBe("current");
  });
});

// ── list_evidence ─────────────────────────────────────────────

describe("handleListEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("lists all evidence for a control_id", () => {
    mockStmt.all.mockReturnValue([EVIDENCE_ROW]);

    const result = handleListEvidence({ control_id: "5.1" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.control_id).toBe("5.1");
    expect(data.count).toBe(1);
    expect(data.evidence).toHaveLength(1);
  });

  it("filters evidence by status when statusFilter is provided", () => {
    const expiredRow = { ...EVIDENCE_ROW, expiry_date: "2020-01-01" };
    const futureRow  = { ...EVIDENCE_ROW, id: "ev-2", expiry_date: "2099-01-01" };
    mockStmt.all.mockReturnValue([expiredRow, futureRow]);

    const result = handleListEvidence({ control_id: "5.1", status: "expired" });

    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.evidence[0].id).toBe("ev-1");
    for (const ev of data.evidence) {
      expect(ev.status).toBe("expired");
    }
  });

  it("returns empty list when no evidence exists", () => {
    mockStmt.all.mockReturnValue([]);

    const result = handleListEvidence({ control_id: "9.9" });

    const data = parseResult(result);
    expect(data.count).toBe(0);
    expect(data.evidence).toHaveLength(0);
  });
});

// ── get_evidence_gaps ─────────────────────────────────────────

describe("handleGetEvidenceGaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws NOT_FOUND when assessment does not exist", () => {
    const assessStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessStmt);

    expect(() => handleGetEvidenceGaps({ assessment_id: "missing" })).toThrow(McpError);

    const s2 = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(s2);
    try {
      handleGetEvidenceGaps({ assessment_id: "missing" });
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("returns empty gaps when no implemented/partial controls exist", () => {
    const assessStmt   = { get: vi.fn(() => { return { id: "assess-1" }; }), all: vi.fn(() => []), run: vi.fn() };
    const statusesStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(assessStmt).mockReturnValueOnce(statusesStmt);

    const result = handleGetEvidenceGaps({ assessment_id: "assess-1" });
    const data = parseResult(result);

    expect(data.total_gaps).toBe(0);
    expect(data.gaps).toHaveLength(0);
  });

  it("returns gap controls that lack current evidence", () => {
    const assessStmt      = { get: vi.fn(() => { return { id: "assess-1" }; }), all: vi.fn(() => []), run: vi.fn() };
    const statusesStmt    = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", status: "implemented" },
        { control_id: "5.2", status: "partial" },
      ]),
      run: vi.fn(),
    };
    // evidenced controls: 5.2 has evidence, 5.1 does not
    const evidencedStmt   = { get: vi.fn(), all: vi.fn(() => [{ control_id: "5.2" }]), run: vi.fn() };
    const detailsStmt     = {
      get: vi.fn(),
      all: vi.fn(() => [{ control_id: "5.1", name: "Policies for IS", theme: "Organizational" }]),
      run: vi.fn(),
    };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusesStmt)
      .mockReturnValueOnce(evidencedStmt)
      .mockReturnValueOnce(detailsStmt);

    const result = handleGetEvidenceGaps({ assessment_id: "assess-1" });
    const data = parseResult(result);

    expect(data.total_gaps).toBe(1);
    expect(data.gaps[0].control_id).toBe("5.1");
    expect(Array.isArray(data.gaps[0].suggested_evidence_types)).toBe(true);
  });

  it("returns empty gaps when all controls already have evidence (gapControlIds.length===0)", () => {
    // Both implemented controls have evidence → gapControlIds is empty → early return
    const assessStmt    = { get: vi.fn(() => ({ id: "assess-2" })), all: vi.fn(() => []), run: vi.fn() };
    const statusesStmt  = {
      get: vi.fn(),
      all: vi.fn(() => [
        { control_id: "5.1", status: "implemented" },
        { control_id: "5.2", status: "partial" },
      ]),
      run: vi.fn(),
    };
    // Both controls have evidence → evidenced set covers all gap controls
    const evidencedStmt = {
      get: vi.fn(),
      all: vi.fn(() => [{ control_id: "5.1" }, { control_id: "5.2" }]),
      run: vi.fn(),
    };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusesStmt)
      .mockReturnValueOnce(evidencedStmt);

    const result = handleGetEvidenceGaps({ assessment_id: "assess-2" });
    const data = parseResult(result);

    expect(data.total_gaps).toBe(0);
    expect(data.gaps).toHaveLength(0);
  });

  it("covers suggestedTypes for Physical, Technological, and unknown themes", () => {
    // One gap control per theme to exercise all suggestedTypes branches
    const themes = ["Physical", "Technological", "Unknown"];
    for (const theme of themes) {
      vi.clearAllMocks();
      mockDb.prepare.mockReturnValue(mockStmt);

      const assessStmt    = { get: vi.fn(() => ({ id: "a" })), all: vi.fn(() => []), run: vi.fn() };
      const statusesStmt  = { get: vi.fn(), all: vi.fn(() => [{ control_id: "5.1", status: "implemented" }]), run: vi.fn() };
      const evidencedStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
      const detailsStmt   = {
        get: vi.fn(),
        all: vi.fn(() => [{ control_id: "5.1", name: `${theme} Control`, theme }]),
        run: vi.fn(),
      };

      mockDb.prepare
        .mockReturnValueOnce(assessStmt)
        .mockReturnValueOnce(statusesStmt)
        .mockReturnValueOnce(evidencedStmt)
        .mockReturnValueOnce(detailsStmt);

      const result = handleGetEvidenceGaps({ assessment_id: "a" });
      const data = parseResult(result);

      expect(data.total_gaps).toBe(1);
      expect(Array.isArray(data.gaps[0].suggested_evidence_types)).toBe(true);
      expect(data.gaps[0].suggested_evidence_types.length).toBeGreaterThan(0);
    }
  });

  it("uses control_id as name fallback when detail is missing from detailMap", () => {
    // detailMap won't have the control → detail is undefined → name = cid, theme = ""
    const assessStmt    = { get: vi.fn(() => ({ id: "a" })), all: vi.fn(() => []), run: vi.fn() };
    const statusesStmt  = { get: vi.fn(), all: vi.fn(() => [{ control_id: "5.99", status: "implemented" }]), run: vi.fn() };
    const evidencedStmt = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    // detailsStmt returns empty list → detailMap has no entry for "5.99"
    const detailsStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(assessStmt)
      .mockReturnValueOnce(statusesStmt)
      .mockReturnValueOnce(evidencedStmt)
      .mockReturnValueOnce(detailsStmt);

    const result = handleGetEvidenceGaps({ assessment_id: "a" });
    const data = parseResult(result);

    expect(data.total_gaps).toBe(1);
    // When detail is missing, name falls back to cid
    expect(data.gaps[0].name).toBe("5.99");
  });
});

// ── link_jira_ticket (INTEGRATION_ERROR) ─────────────────────

describe("handleLinkJiraTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws INTEGRATION_ERROR when Jira env vars are not set", async () => {
    // requireEvidence will be called first — mock it to return a row
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    await expect(
      handleLinkJiraTicket({ evidence_id: "ev-1", summary: "New ticket" }),
    ).rejects.toThrow(McpError);

    const evidenceStmt2 = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt2);
    try {
      await handleLinkJiraTicket({ evidence_id: "ev-1", summary: "New ticket" });
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("INTEGRATION_ERROR");
    }
  });
});

// ── link_github_issue (INTEGRATION_ERROR) ────────────────────

describe("handleLinkGithubIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws INTEGRATION_ERROR when GitHub env vars are not set", async () => {
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    await expect(
      handleLinkGithubIssue({ evidence_id: "ev-1", title: "New issue" }),
    ).rejects.toThrow(McpError);

    const evidenceStmt2 = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt2);
    try {
      await handleLinkGithubIssue({ evidence_id: "ev-1", title: "New issue" });
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("INTEGRATION_ERROR");
    }
  });

  it("throws NOT_FOUND when evidence does not exist", async () => {
    const evidenceStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    await expect(
      handleLinkGithubIssue({ evidence_id: "missing", title: "New issue" }),
    ).rejects.toThrow(McpError);
  });
});

// ── handleLinkJiraTicket — configured (happy paths) ──────────────────────

describe("handleLinkJiraTicket — configured Jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    // Override getEnv to return Jira credentials
    vi.mocked(getEnv).mockImplementation((key: string, defaultVal: string) => {
      const cfg: Record<string, string> = {
        JIRA_BASE_URL:    "https://test.atlassian.net",
        JIRA_API_TOKEN:   "test-api-token",
        JIRA_PROJECT_KEY: "ISMS",
        JIRA_USER_EMAIL:  "tester@example.com",
      };
      return cfg[key] ?? defaultVal;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links an existing Jira issue when jira_key is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ key: "ISMS-42", self: "https://test.atlassian.net/rest/api/3/issue/ISMS-42" }),
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt).mockReturnValueOnce(updateStmt);

    const result = await handleLinkJiraTicket({ evidence_id: "ev-1", jira_key: "ISMS-42" });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.jira_key).toBe("ISMS-42");
    expect(data.action).toBe("linked");
    expect(data.jira_url).toContain("ISMS-42");
  });

  it("creates a new Jira issue when summary is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ key: "ISMS-99" }),
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt).mockReturnValueOnce(updateStmt);

    const result = await handleLinkJiraTicket({
      evidence_id: "ev-1",
      summary:     "Implement access control review",
      description: "See control 5.15",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.jira_key).toBe("ISMS-99");
    expect(data.action).toBe("created");
  });

  it("throws INTEGRATION_ERROR when Jira API returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("Unauthorized"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    await expect(
      handleLinkJiraTicket({ evidence_id: "ev-1", jira_key: "ISMS-999" }),
    ).rejects.toThrow(McpError);
  });

  it("throws INTEGRATION_ERROR when neither jira_key nor summary is provided (covers else branch)", async () => {
    // Credentials ARE configured (from beforeEach), but no jira_key and no summary → else throw
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    try {
      await handleLinkJiraTicket({ evidence_id: "ev-1" });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("INTEGRATION_ERROR");
    }
  });
});

// ── handleLinkGithubIssue — configured (happy paths) ─────────────────────

describe("handleLinkGithubIssue — configured GitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    // Override getEnv to return GitHub credentials
    vi.mocked(getEnv).mockImplementation((key: string, defaultVal: string) => {
      const cfg: Record<string, string> = {
        GITHUB_TOKEN: "ghp_testtoken",
        GITHUB_REPO:  "acme/isms-repo",
      };
      return cfg[key] ?? defaultVal;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links an existing GitHub issue when issue_number is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ number: 7, html_url: "https://github.com/acme/isms-repo/issues/7" }),
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt).mockReturnValueOnce(updateStmt);

    const result = await handleLinkGithubIssue({ evidence_id: "ev-1", issue_number: 7 });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.github_issue_number).toBe(7);
    expect(data.action).toBe("linked");
    expect(data.github_issue_url).toContain("issues/7");
  });

  it("creates a new GitHub issue when title is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ number: 42, html_url: "https://github.com/acme/isms-repo/issues/42" }),
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt).mockReturnValueOnce(updateStmt);

    const result = await handleLinkGithubIssue({
      evidence_id: "ev-1",
      title:       "Set up MFA for all admin accounts",
      body:        "Related to control 8.5",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.github_issue_number).toBe(42);
    expect(data.action).toBe("created");
  });

  it("throws INTEGRATION_ERROR when GitHub API returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue("Forbidden"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    await expect(
      handleLinkGithubIssue({ evidence_id: "ev-1", issue_number: 999 }),
    ).rejects.toThrow(McpError);
  });

  it("throws INTEGRATION_ERROR when neither issue_number nor title is provided (covers else branch)", async () => {
    // Credentials ARE configured (from beforeEach), but no issue_number and no title → else throw
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    try {
      await handleLinkGithubIssue({ evidence_id: "ev-1" });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("INTEGRATION_ERROR");
    }
  });
});

// ── register_evidence — integrity fields & superseding (migration 0011) ──

describe("handleRegisterEvidence — integrity fields and superseding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("preview includes provided integrity fields in the diff", () => {
    const sha = "a".repeat(64);
    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "log",
      description: "Quarterly access review export",
      collected_by: "auditor@example.com",
      collected_date: "2025-01-01",
      content_sha256: sha,
      source_system: "okta",
      period_start: "2025-01-01",
      period_end: "2025-03-31",
      assertion: "All admin access reviewed for Q1",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.diff).toContain("content_sha256");
    expect(data.diff).toContain("source_system");
    expect(data.diff).toContain("period_start");
    expect(data.diff).toContain("assertion");
    // No supersede target → no DB calls in the preview branch
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it("commit persists the integrity fields", () => {
    const shaRow = {
      ...EVIDENCE_ROW,
      content_sha256: "b".repeat(64),
      source_system: "okta",
      period_start: "2025-01-01",
      period_end: "2025-03-31",
    };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => shaRow), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const PROPOSAL = "66666666-6666-4666-8666-666666666666";
    _testSeedProposal(PROPOSAL, "register_evidence");

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "log",
      description: "Quarterly access review export",
      collected_by: "auditor@example.com",
      collected_date: "2025-01-01",
      content_sha256: "b".repeat(64),
      source_system: "okta",
      period_start: "2025-01-01",
      period_end: "2025-03-31",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.content_sha256).toBe("b".repeat(64));
    expect(data.source_system).toBe("okta");
    const insertSql = (mockDb.prepare.mock.calls[0] as unknown[])[0] as string;
    expect(insertSql).toContain("content_sha256");
    expect(insertSql).toContain("supersedes_evidence_id");
  });

  it("throws NOT_FOUND when supersedes_evidence_id does not exist (even in preview)", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    try {
      handleRegisterEvidence({
        control_id: "5.1",
        type: "log",
        description: "Replacement artefact",
        collected_by: "auditor@example.com",
        collected_date: "2025-01-01",
        supersedes_evidence_id: "00000000-0000-4000-8000-00000000dead",
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("superseding an evidence record auto-expires the old one on commit", () => {
    const oldRow = { ...EVIDENCE_ROW, id: "ev-old" };
    const newRow = { ...EVIDENCE_ROW, id: "ev-new", supersedes_evidence_id: "ev-old" };
    const targetStmt = { get: vi.fn(() => oldRow), all: vi.fn(() => []), run: vi.fn() };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const expireStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => newRow), all: vi.fn(() => []) };

    mockDb.prepare
      .mockReturnValueOnce(targetStmt)  // requireEvidence(supersedes)
      .mockReturnValueOnce(insertStmt)  // INSERT new evidence
      .mockReturnValueOnce(expireStmt)  // UPDATE old evidence expiry
      .mockReturnValueOnce(selectStmt); // SELECT back

    const PROPOSAL = "77777777-7777-4777-8777-777777777777";
    _testSeedProposal(PROPOSAL, "register_evidence");

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "log",
      description: "Replacement artefact",
      collected_by: "auditor@example.com",
      collected_date: "2025-06-01",
      supersedes_evidence_id: "ev-old",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.superseded_note).toContain("ev-old");
    expect(data.superseded_note).toMatch(/expiry_date/);
    // The expiry update targets the superseded row
    const expireSql = (mockDb.prepare.mock.calls[2] as unknown[])[0] as string;
    expect(expireSql).toContain("UPDATE evidence SET expiry_date");
    expect(expireStmt.run).toHaveBeenCalled();
    expect((expireStmt.run.mock.calls[0] as unknown[])[2]).toBe("ev-old");
  });
});

// ── verify_evidence ───────────────────────────────────────────

describe("handleVerifyEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("throws NOT_FOUND when the evidence does not exist", () => {
    const missingStmt = { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(missingStmt);

    try {
      handleVerifyEvidence({
        evidence_id: "missing",
        reviewer: "independent@example.com",
        verification_status: "rejected",
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("NOT_FOUND");
    }
  });

  it("enforces the independence rule: reviewer must differ from the collector", () => {
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    try {
      handleVerifyEvidence({
        evidence_id: "ev-1",
        reviewer: "auditor@example.com", // same as collected_by
        verification_status: "verified",
        sufficiency: "sufficient",
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("reviewer");
      expect((err as McpError).message).toMatch(/someone other than its collector/);
    }
  });

  it("requires sufficiency when verification_status is 'verified'", () => {
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    try {
      handleVerifyEvidence({
        evidence_id: "ev-1",
        reviewer: "independent@example.com",
        verification_status: "verified",
        // sufficiency omitted
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as McpError).error_code).toBe("BUSINESS_RULE");
      expect((err as McpError).field).toBe("sufficiency");
    }
  });

  it("preview returns the verification diff without writing", () => {
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    const result = handleVerifyEvidence({
      evidence_id: "ev-1",
      reviewer: "independent@example.com",
      verification_status: "verified",
      sufficiency: "sufficient",
      assertion: "Demonstrates the IS policy is approved and current",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.hitl_proposed).toBe(true);
    expect(data.status).toBe("preview");
    expect(data.evidence_id).toBe("ev-1");
    expect(data.diff).toContain("verification_status");
    expect(data.diff).toContain("reviewer");
    expect(data.diff).toContain("sufficiency");
    expect(data.diff).toContain("assertion");
    // Only the evidence lookup — no UPDATE in the preview branch
    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
  });

  it("commit updates the verification fields and returns the row", () => {
    const verifiedRow = {
      ...EVIDENCE_ROW,
      reviewer: "independent@example.com",
      verification_status: "verified",
      verification_date: "2026-08-30",
      sufficiency: "sufficient",
    };
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const selectStmt   = { get: vi.fn(() => verifiedRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(evidenceStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(selectStmt);

    const PROPOSAL = "88888888-8888-4888-8888-888888888888";
    _testSeedProposal(PROPOSAL, "verify_evidence");

    const result = handleVerifyEvidence({
      evidence_id: "ev-1",
      reviewer: "independent@example.com",
      verification_status: "verified",
      sufficiency: "sufficient",
      verification_date: "2026-08-30",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.verification_status).toBe("verified");
    expect(data.reviewer).toBe("independent@example.com");
    expect(data.sufficiency).toBe("sufficient");
    expect(typeof data.status).toBe("string"); // evidence currency status retained
    expect(updateStmt.run).toHaveBeenCalledWith(
      "independent@example.com", "verified", "2026-08-30",
      "sufficient", null, expect.any(String), "ev-1",
    );
  });

  it("commit rejects a stale proposal when the evidence changed since preview (version binding)", () => {
    const evidenceStmt = { get: vi.fn(() => ({ ...EVIDENCE_ROW, updated_at: "2026-01-01T00:00:00Z" })), all: vi.fn(() => []), run: vi.fn() };
    mockDb.prepare.mockReturnValueOnce(evidenceStmt);

    const PROPOSAL = "99999999-9999-4999-8999-999999999999";
    _testSeedProposal(PROPOSAL, "verify_evidence", {
      resource_version: "2025-01-01T00:00:00Z", // preview-time version
    });

    expect(() =>
      handleVerifyEvidence({
        evidence_id: "ev-1",
        reviewer: "independent@example.com",
        verification_status: "rejected",
        confirmed: true,
        proposal_id: PROPOSAL,
      }),
    ).toThrow(/version conflict/);
  });

  it("defaults verification_date to today when omitted (rejected outcome)", () => {
    const rejectedRow = {
      ...EVIDENCE_ROW,
      reviewer: "independent@example.com",
      verification_status: "rejected",
    };
    const evidenceStmt = { get: vi.fn(() => EVIDENCE_ROW), all: vi.fn(() => []), run: vi.fn() };
    const updateStmt   = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    const selectStmt   = { get: vi.fn(() => rejectedRow), all: vi.fn(() => []), run: vi.fn() };

    mockDb.prepare
      .mockReturnValueOnce(evidenceStmt)
      .mockReturnValueOnce(updateStmt)
      .mockReturnValueOnce(selectStmt);

    const PROPOSAL = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaa1111";
    _testSeedProposal(PROPOSAL, "verify_evidence");

    const result = handleVerifyEvidence({
      evidence_id: "ev-1",
      reviewer: "independent@example.com",
      verification_status: "rejected",
      confirmed: true,
      proposal_id: PROPOSAL,
    });

    expect(result.isError).toBe(false);
    const todayStr = new Date().toISOString().split("T")[0];
    expect((updateStmt.run.mock.calls[0] as unknown[])[2]).toBe(todayStr);
  });
});
