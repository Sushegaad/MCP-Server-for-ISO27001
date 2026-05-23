/**
 * iso27001-mcp — Group 4: Policy Management handlers
 *
 * create_policy, get_policy, update_policy, list_policies
 *
 * create_policy renders a Mustache template from src/seed/policy-templates/
 * and stores the rendered Markdown as the policy content.
 * update_policy archives the current version and increments version number.
 */

import Mustache from "mustache";
import { getDb } from "../db/connection.js";
import { newId, now, addMonths, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";
import { loadTemplate, loadPartials, stripFrontmatter } from "./template-utils.js";
import { loadOrgProfileDefaults } from "./org-profile.js";

// ── Types ─────────────────────────────────────────────────────

interface PolicyRow {
  id: string;
  type: string;
  organisation_name: string;
  scope: string;
  owner: string;
  approver: string | null;
  status: string;
  version: number;
  content: string;
  clause_mappings: string | null;
  control_mappings: string | null;
  review_cycle_months: number;
  effective_date: string;
  next_review_date: string;
  reviewed_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyVersionRow {
  id: string;
  policy_id: string;
  version: number;
  content: string;
  change_summary: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  archived_at: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── create_policy ─────────────────────────────────────────────

export function handleCreatePolicy(args: Record<string, unknown>): ToolResult {
  const {
    type, organisation_name, scope, owner, approver,
    review_cycle_months = 12, effective_date,
  } = args as {
    type: string; organisation_name?: string; scope?: string;
    owner: string; approver?: string;
    review_cycle_months?: number; effective_date: string;
  };

  // Auto-inject org profile defaults when caller omits organisation_name / scope
  const db = getDb();
  const profileDefaults = loadOrgProfileDefaults(db);
  const resolvedOrgName = organisation_name ?? profileDefaults?.organisation_name;
  const resolvedScope   = scope           ?? profileDefaults?.scope;

  if (!resolvedOrgName || !resolvedScope) {
    throw businessRule(
      "organisation_name",
      "organisation_name and scope are required — supply them explicitly or call set_organization_profile first.",
    );
  }

  const id             = newId();
  const next_review    = addMonths(new Date(effective_date), review_cycle_months);
  const ts             = now();

  // Load and render Mustache template
  const raw                                      = loadTemplate(type, "policy-templates");
  const { template, clauseMappings, controlMappings } = stripFrontmatter(raw);

  const rendered = Mustache.render(template, {
    policy_id:         id,
    organisation_name: resolvedOrgName,
    scope:             resolvedScope,
    owner,
    approver:          approver ?? "TBD",
    effective_date,
    next_review_date:  next_review,
    version:           "1.0",
    clause_mappings:   clauseMappings.join(", "),
    control_mappings:  controlMappings.join(", "),
  }, loadPartials());

  db.prepare(`
    INSERT INTO policies
      (id, type, organisation_name, scope, owner, approver, status, version,
       content, clause_mappings, control_mappings, review_cycle_months,
       effective_date, next_review_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, type, resolvedOrgName, resolvedScope, owner, approver ?? null,
    rendered,
    JSON.stringify(clauseMappings), JSON.stringify(controlMappings),
    review_cycle_months, effective_date, next_review, ts, ts,
  );

  return ok({
    id,
    type,
    organisation_name: resolvedOrgName,
    version: 1,
    status: "draft",
    effective_date,
    next_review_date: next_review,
    clause_mappings:  clauseMappings,
    control_mappings: controlMappings,
    created_at: ts,
    // Return a preview excerpt — the caller can call get_policy for the full content
    content_preview: rendered.slice(0, 500) + (rendered.length > 500 ? "\n…(truncated)" : ""),
  });
}

// ── get_policy ────────────────────────────────────────────────

export function handleGetPolicy(args: Record<string, unknown>): ToolResult {
  const { policy_id, include_versions = false } = args as {
    policy_id: string; include_versions?: boolean;
  };

  const db  = getDb();
  const row = db.prepare("SELECT * FROM policies WHERE id = ?").get(policy_id) as PolicyRow | undefined;
  if (!row) throw notFound("policy", policy_id);

  const result: Record<string, unknown> = {
    ...row,
    clause_mappings:  fromJsonArray<string>(row.clause_mappings),
    control_mappings: fromJsonArray<string>(row.control_mappings),
  };

  if (include_versions) {
    const versions = db.prepare(
      "SELECT id, version, change_summary, reviewed_by, archived_at FROM policy_versions WHERE policy_id = ? ORDER BY version DESC"
    ).all(policy_id) as Omit<PolicyVersionRow, "content" | "approved_by" | "policy_id">[];
    result["versions"] = versions;
  }

  return ok(result);
}

// ── update_policy ─────────────────────────────────────────────

export function handleUpdatePolicy(args: Record<string, unknown>): ToolResult {
  const { policy_id, scope, owner, approver, reviewed_by, change_summary } = args as {
    policy_id: string; scope?: string; owner?: string;
    approver?: string; reviewed_by: string; change_summary: string;
  };

  const db      = getDb();
  const current = db.prepare("SELECT * FROM policies WHERE id = ?").get(policy_id) as PolicyRow | undefined;
  if (!current) throw notFound("policy", policy_id);
  if (current.status === "archived") {
    throw businessRule("policy", "Cannot update an archived policy.");
  }

  const ts         = now();
  const newVersion = current.version + 1;

  // Archive the current version
  db.prepare(`
    INSERT INTO policy_versions
      (id, policy_id, version, content, change_summary, reviewed_by, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newId(), policy_id, current.version, current.content, change_summary, reviewed_by, ts);

  // Rebuild content from updated fields
  const raw = loadTemplate(current.type, "policy-templates");
  const { template, clauseMappings, controlMappings } = stripFrontmatter(raw);

  const newScope = scope ?? current.scope;
  const newOwner = owner ?? current.owner;

  const rendered = Mustache.render(template, {
    policy_id,
    organisation_name: current.organisation_name,
    scope:             newScope,
    owner:             newOwner,
    approver:          approver ?? current.approver ?? "TBD",
    effective_date:    current.effective_date,
    next_review_date:  current.next_review_date,
    version:           `${newVersion}.0`,
    clause_mappings:   clauseMappings.join(", "),
    control_mappings:  controlMappings.join(", "),
  }, loadPartials());

  db.prepare(`
    UPDATE policies SET
      scope       = COALESCE(?, scope),
      owner       = COALESCE(?, owner),
      approver    = COALESCE(?, approver),
      reviewed_by = ?,
      version     = ?,
      content     = ?,
      clause_mappings  = ?,
      control_mappings = ?,
      updated_at  = ?
    WHERE id = ?
  `).run(
    scope ?? null, owner ?? null, approver ?? null,
    reviewed_by, newVersion, rendered,
    JSON.stringify(clauseMappings), JSON.stringify(controlMappings),
    ts, policy_id,
  );

  return ok({
    id:       policy_id,
    version:  newVersion,
    reviewed_by,
    change_summary,
    updated_at: ts,
  });
}

// ── list_policies ─────────────────────────────────────────────

export function handleListPolicies(args: Record<string, unknown>): ToolResult {
  const { status, type, owner, overdue_only = false, limit = 50, offset = 0 } = args as {
    status?: string; type?: string; owner?: string;
    overdue_only?: boolean; limit?: number; offset?: number;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (status) { conditions.push("status = ?"); params.push(status); }
  if (type)   { conditions.push("type = ?");   params.push(type); }
  if (owner)  { conditions.push("owner = ?");  params.push(owner); }
  if (overdue_only) {
    conditions.push("next_review_date < date('now')");
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db    = getDb();

  const total = (db.prepare(`SELECT count(*) AS n FROM policies ${where}`).get(...params) as { n: number }).n;
  params.push(limit, offset);

  const rows = db.prepare(
    `SELECT id, type, organisation_name, owner, approver, status, version,
            effective_date, next_review_date, review_cycle_months, created_at, updated_at
     FROM policies ${where}
     ORDER BY next_review_date ASC, created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params) as Omit<PolicyRow, "content" | "clause_mappings" | "control_mappings" | "reviewed_by" | "approved_by">[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = rows.map((p) => {
    const reviewDate  = new Date(p.next_review_date);
    const diffMs      = reviewDate.getTime() - today.getTime();
    const daysUntil   = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      ...p,
      days_until_review: daysUntil,
      overdue:           daysUntil < 0,
    };
  });

  return ok({ total, limit, offset, policies: enriched });
}
