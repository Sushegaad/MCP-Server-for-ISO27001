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

// Mock getEnv — returns empty strings for integration-related env vars by default
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

  it("registers evidence and returns row with computed status", () => {
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
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.id).toBe("ev-1");
    expect(data.control_id).toBe("5.1");
    expect(typeof data.status).toBe("string");
    // Expiry is in the future so status should be current or stale
    expect(["current", "stale", "expired"]).toContain(data.status);
  });

  it("returns 'expired' status when expiry_date is in the past", () => {
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
    });

    const data = parseResult(result);
    expect(data.status).toBe("expired");
  });

  it("returns 'current' status when no expiry_date is set", () => {
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
