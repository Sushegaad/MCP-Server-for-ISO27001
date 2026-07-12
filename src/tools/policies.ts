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
import type { PolicyRow, PolicyVersionRow } from "../db/types.js";
import { notFound, businessRule } from "../types/errors.js";
import { ok, type ToolResult } from "../types/result.js";
import { loadTemplate, loadPartials, stripFrontmatter } from "./template-utils.js";
import { loadOrgProfileDefaults } from "./org-profile.js";
import { buildDiffTable, type DiffRow, createProposal, consumeProposal } from "./hitl-utils.js";


// ── create_policy ─────────────────────────────────────────────

export function handleCreatePolicy(args: Record<string, unknown>): ToolResult {
  const {
    type, organisation_name, scope, owner, approver,
    review_cycle_months = 12, effective_date,
    confirmed = false, proposal_id,
  } = args as {
    type: string; organisation_name?: string; scope?: string;
    owner: string; approver?: string;
    review_cycle_months?: number; effective_date: string;
    confirmed?: boolean; proposal_id?: string;
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

  const next_review    = addMonths(new Date(effective_date), review_cycle_months);

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [
      { field: "type",              old: null, new: type },
      { field: "organisation_name", old: null, new: resolvedOrgName },
      { field: "owner",             old: null, new: owner },
      { field: "approver",          old: null, new: approver ?? "TBD" },
      { field: "status",            old: null, new: "draft" },
      { field: "version",           old: null, new: 1 },
      { field: "effective_date",    old: null, new: effective_date },
      { field: "next_review_date",  old: null, new: next_review },
    ];
    const proposal_id_token = createProposal("create_policy");
    return ok({
      hitl_proposed: true,
      status:        "preview",
      proposal_id:   proposal_id_token,
      expires_in:    "10 minutes",
      policy_type:   type,
      message:       "⏸ No data written. Pass \"confirmed\": true to generate and save this policy.",
      diff:          buildDiffTable(rows),
    });
  }

  consumeProposal(proposal_id, "create_policy");
  const id             = newId();
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
  const { policy_id, scope, owner, approver, reviewed_by, change_summary, confirmed = false, proposal_id } = args as {
    policy_id: string; scope?: string; owner?: string;
    approver?: string; reviewed_by: string; change_summary: string;
    confirmed?: boolean; proposal_id?: string;
  };

  const db      = getDb();
  const current = db.prepare("SELECT * FROM policies WHERE id = ?").get(policy_id) as PolicyRow | undefined;
  if (!current) throw notFound("policy", policy_id);
  if (current.status === "archived") {
    throw businessRule("policy", "Cannot update an archived policy.");
  }

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [];
    rows.push({ field: "version", old: current.version, new: current.version + 1 });
    if (scope !== undefined && scope !== current.scope)
      rows.push({ field: "scope", old: current.scope, new: scope });
    if (owner !== undefined && owner !== current.owner)
      rows.push({ field: "owner", old: current.owner, new: owner });
    if (approver !== undefined && approver !== current.approver)
      rows.push({ field: "approver", old: current.approver, new: approver });
    rows.push({ field: "reviewed_by", old: current.reviewed_by, new: reviewed_by });
    rows.push({ field: "change_summary", old: "(none)", new: change_summary });
    const proposal_id_token = createProposal("update_policy");
    return ok({
      hitl_proposed: true,
      status:        "preview",
      proposal_id:   proposal_id_token,
      expires_in:    "10 minutes",
      policy_id,
      policy_type:   current.type,
      message:       "⏸ No data written. The current version will be archived and a new version created. Pass \"confirmed\": true to apply this change.",
      diff:          buildDiffTable(rows),
    });
  }

  consumeProposal(proposal_id, "update_policy");
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
