/**
 * iso27001-mcp — Group 5: Evidence Tracking handlers
 *
 * register_evidence, list_evidence, get_evidence_gaps,
 * link_jira_ticket, link_github_issue
 */

import { getDb } from "../db/connection.js";
import { newId, now, computeEvidenceStatus } from "../db/dal.js";
import { notFound, integrationError } from "../types/errors.js";
import { ok, type ToolResult } from "../types/result.js";
import { getEnv } from "../security/secrets.js";
import { buildDiffTable, type DiffRow, createProposal, consumeProposal } from "./hitl-utils.js";
import { suggestedTypes } from "./evidence-utils.js";

// ── Types ─────────────────────────────────────────────────────

interface EvidenceRow {
  id: string;
  control_id: string;
  type: string;
  description: string;
  source_url: string | null;
  collected_by: string;
  collected_date: string;
  expiry_date: string | null;
  jira_key: string | null;
  jira_url: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  created_at: string;
  updated_at: string;
}

interface ControlStatusRow {
  control_id: string;
  status: string;
}

interface ControlDetailRow {
  control_id: string;
  name: string;
  theme: string;
}


function requireEvidence(id: string): EvidenceRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as EvidenceRow | undefined;
  if (!row) throw notFound("evidence", id);
  return row;
}

// ── Retry helper ──────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status >= 500 && attempt < maxRetries) {
      lastError = new Error(`HTTP ${resp.status}`);
      await new Promise((res) => setTimeout(res, 1000));
      continue;
    }
    return resp;
  }
  throw lastError ?? new Error("fetch failed");
}

// ── register_evidence ─────────────────────────────────────────

export function handleRegisterEvidence(args: Record<string, unknown>): ToolResult {
  const {
    control_id, type, description, source_url,
    collected_by, collected_date, expiry_date,
    confirmed = false, proposal_id,
  } = args as {
    control_id: string; type: string; description: string;
    source_url?: string; collected_by: string;
    collected_date: string; expiry_date?: string;
    confirmed?: boolean; proposal_id?: string;
  };

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [
      { field: "control_id",     old: null, new: control_id },
      { field: "type",           old: null, new: type },
      { field: "description",    old: null, new: description },
      { field: "collected_by",   old: null, new: collected_by },
      { field: "collected_date", old: null, new: collected_date },
      { field: "expiry_date",    old: null, new: expiry_date ?? "—" },
      { field: "source_url",     old: null, new: source_url ?? "—" },
    ];
    const proposal_id_token = createProposal("register_evidence");
    return ok({
      hitl_proposed: true,
      status:        "preview",
      proposal_id:   proposal_id_token,
      expires_in:    "10 minutes",
      message:       "⏸ No data written. Pass \"confirmed\": true to register this evidence.",
      diff:          buildDiffTable(rows),
    });
  }

  consumeProposal(proposal_id, "register_evidence");
  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO evidence
      (id, control_id, type, description, source_url,
       collected_by, collected_date, expiry_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, control_id, type, description, source_url ?? null,
    collected_by, collected_date, expiry_date ?? null, ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM evidence WHERE id = ?").get(id) as EvidenceRow;
  const status = computeEvidenceStatus(created.collected_date, created.expiry_date);

  return ok({ ...created, status });
}

// ── list_evidence ─────────────────────────────────────────────

export function handleListEvidence(args: Record<string, unknown>): ToolResult {
  const { control_id, status: statusFilter } = args as {
    control_id: string; status?: string;
  };

  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM evidence WHERE control_id = ? ORDER BY collected_date DESC"
  ).all(control_id) as EvidenceRow[];

  const withStatus = rows.map((r) => ({
    ...r,
    status: computeEvidenceStatus(r.collected_date, r.expiry_date),
  }));

  const filtered = statusFilter
    ? withStatus.filter((r) => r.status === statusFilter)
    : withStatus;

  return ok({
    count: filtered.length,
    control_id,
    evidence: filtered,
  });
}

// ── get_evidence_gaps ─────────────────────────────────────────

export function handleGetEvidenceGaps(args: Record<string, unknown>): ToolResult {
  const { assessment_id } = args as { assessment_id: string };

  const db = getDb();

  const assessment = db.prepare(
    "SELECT id FROM gap_assessments WHERE id = ?"
  ).get(assessment_id) as { id: string } | undefined;
  if (!assessment) throw notFound("gap_assessment", assessment_id);

  // Get all controls with status 'implemented' or 'partial'
  const controlStatuses = db.prepare(`
    SELECT cs.control_id, cs.status
    FROM control_statuses cs
    WHERE cs.assessment_id = ? AND cs.status IN ('implemented', 'partial')
  `).all(assessment_id) as ControlStatusRow[];

  if (controlStatuses.length === 0) {
    return ok({ assessment_id, gaps: [], total_gaps: 0 });
  }

  const controlIds = controlStatuses.map((c) => c.control_id);
  const placeholders = controlIds.map(() => "?").join(",");

  // For each control, check if there's any current evidence
  const evidencedControls = db.prepare(`
    SELECT DISTINCT control_id
    FROM evidence
    WHERE control_id IN (${placeholders})
      AND (expiry_date IS NULL OR expiry_date > date('now'))
  `).all(...controlIds) as { control_id: string }[];

  const evidencedSet = new Set(evidencedControls.map((e) => e.control_id));
  const gapControlIds = controlIds.filter((cid) => !evidencedSet.has(cid));

  if (gapControlIds.length === 0) {
    return ok({ assessment_id, gaps: [], total_gaps: 0 });
  }

  // Fetch control details for gap controls
  const gapPlaceholders = gapControlIds.map(() => "?").join(",");
  const controlDetails = db.prepare(`
    SELECT control_id, name, theme
    FROM controls
    WHERE control_id IN (${gapPlaceholders})
  `).all(...gapControlIds) as ControlDetailRow[];

  const detailMap = new Map(controlDetails.map((c) => [c.control_id, c]));

  const gaps = gapControlIds.map((cid) => {
    const detail = detailMap.get(cid);
    const theme = detail?.theme ?? "";
    return {
      control_id: cid,
      name: detail?.name ?? cid,
      theme,
      current_status: controlStatuses.find((cs) => cs.control_id === cid)?.status ?? "unknown",
      suggested_evidence_types: suggestedTypes(theme),
    };
  });

  return ok({ assessment_id, total_gaps: gaps.length, gaps });
}

// ── link_jira_ticket ──────────────────────────────────────────

export async function handleLinkJiraTicket(args: Record<string, unknown>): Promise<ToolResult> {
  const { evidence_id, jira_key, summary, description } = args as {
    evidence_id: string; jira_key?: string; summary?: string; description?: string;
  };

  const evidence = requireEvidence(evidence_id);
  void evidence;

  const baseUrl  = getEnv("JIRA_BASE_URL", "");
  const apiToken = getEnv("JIRA_API_TOKEN", "");
  const project  = getEnv("JIRA_PROJECT_KEY", "");

  if (!baseUrl || !apiToken || !project) {
    throw integrationError(
      "link_jira_ticket",
      "Jira not configured. Set JIRA_BASE_URL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY.",
    );
  }

  const userEmail = getEnv("JIRA_USER_EMAIL", "");
  const credentials = Buffer.from(`${userEmail}:${apiToken}`).toString("base64");
  const authHeader = `Basic ${credentials}`;
  const signal = AbortSignal.timeout(10_000);

  let resolvedKey: string;
  let jiraUrl: string;
  let action: "linked" | "created";

  if (jira_key) {
    // Fetch existing issue
    const url = `${baseUrl}/rest/api/3/issue/${jira_key}`;
    const resp = await fetchWithRetry(url, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal,
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw integrationError("jira", `Jira API error: ${resp.status} ${body}`);
    }
    const data = await resp.json() as { key: string; self: string };
    resolvedKey = data.key;
    jiraUrl     = `${baseUrl}/browse/${resolvedKey}`;
    action      = "linked";
  } else if (summary) {
    // Create new issue
    const url = `${baseUrl}/rest/api/3/issue`;
    const body = {
      fields: {
        project:     { key: project },
        summary,
        description: {
          type:    "doc",
          version: 1,
          content: [
            {
              type:    "paragraph",
              content: [{ type: "text", text: description ?? "" }],
            },
          ],
        },
        issuetype: { name: "Task" },
      },
    };
    const resp = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) {
      const respBody = await resp.text();
      throw integrationError("jira", `Jira API error: ${resp.status} ${respBody}`);
    }
    const data = await resp.json() as { key: string };
    resolvedKey = data.key;
    jiraUrl     = `${baseUrl}/browse/${resolvedKey}`;
    action      = "created";
  } else {
    throw integrationError("link_jira_ticket", "Provide either jira_key (to link) or summary (to create).");
  }

  // Update evidence record
  const ts = now();
  getDb().prepare(
    "UPDATE evidence SET jira_key = ?, jira_url = ?, updated_at = ? WHERE id = ?"
  ).run(resolvedKey, jiraUrl, ts, evidence_id);

  return ok({ evidence_id, jira_key: resolvedKey, jira_url: jiraUrl, action });
}

// ── link_github_issue ─────────────────────────────────────────

export async function handleLinkGithubIssue(args: Record<string, unknown>): Promise<ToolResult> {
  const { evidence_id, issue_number, title, body } = args as {
    evidence_id: string; issue_number?: number; title?: string; body?: string;
  };

  const evidence = requireEvidence(evidence_id);
  void evidence;

  const ghToken = getEnv("GITHUB_TOKEN", "");
  const ghRepo  = getEnv("GITHUB_REPO", "");

  if (!ghToken || !ghRepo) {
    throw integrationError(
      "link_github_issue",
      "GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO (format: owner/repo).",
    );
  }

  const authHeader = `Bearer ${ghToken}`;
  const signal = AbortSignal.timeout(10_000);

  let resolvedNumber: number;
  let issueUrl: string;
  let action: "linked" | "created";

  if (issue_number !== undefined) {
    // Fetch existing issue
    const url = `https://api.github.com/repos/${ghRepo}/issues/${issue_number}`;
    const resp = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
    });
    if (!resp.ok) {
      const respBody = await resp.text();
      throw integrationError("github", `GitHub API error: ${resp.status} ${respBody}`);
    }
    const data = await resp.json() as { number: number; html_url: string };
    resolvedNumber = data.number;
    issueUrl       = data.html_url;
    action         = "linked";
  } else if (title) {
    // Create new issue
    const url = `https://api.github.com/repos/${ghRepo}/issues`;
    const payload = {
      title,
      body:   body ?? "",
      labels: ["compliance", "iso27001"],
    };
    const resp = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!resp.ok) {
      const respBody = await resp.text();
      throw integrationError("github", `GitHub API error: ${resp.status} ${respBody}`);
    }
    const data = await resp.json() as { number: number; html_url: string };
    resolvedNumber = data.number;
    issueUrl       = data.html_url;
    action         = "created";
  } else {
    throw integrationError("link_github_issue", "Provide either issue_number (to link) or title (to create).");
  }

  // Update evidence record
  const ts = now();
  getDb().prepare(
    "UPDATE evidence SET github_issue_url = ?, github_issue_number = ?, updated_at = ? WHERE id = ?"
  ).run(issueUrl, resolvedNumber, ts, evidence_id);

  return ok({ evidence_id, github_issue_number: resolvedNumber, github_issue_url: issueUrl, action });
}
