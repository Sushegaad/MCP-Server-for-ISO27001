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
} from "../../../src/tools/evidence-tracking.js";
import { McpError } from "../../../src/types/errors.js";
import { getEnv } from "../../../src/security/secrets.js";

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

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Information Security Policy document",
      collected_by: "auditor@example.com",
      collected_date: "2025-01-01",
      expiry_date: "2026-01-01",
      source_url: "https://example.com/policy.pdf",
      confirmed: true,
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

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Old policy",
      collected_by: "auditor",
      collected_date: "2020-01-01",
      expiry_date: "2020-01-01",
      confirmed: true,
    });

    const data = parseResult(result);
    expect(data.status).toBe("expired");
  });

  it("returns 'current' status when no expiry_date is set (confirmed=true)", () => {
    const noExpiryRow = { ...EVIDENCE_ROW, expiry_date: null };
    const insertStmt = { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) };
    const selectStmt = { run: vi.fn(), get: vi.fn(() => noExpiryRow), all: vi.fn(() => []) };
    mockDb.prepare.mockReturnValueOnce(insertStmt).mockReturnValueOnce(selectStmt);

    const result = handleRegisterEvidence({
      control_id: "5.1",
      type: "policy",
      description: "Policy no expiry",
      collected_by: "auditor",
      collected_date: "2025-01-01",
      confirmed: true,
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
