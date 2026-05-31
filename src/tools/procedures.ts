/**
 * iso27001-mcp — Group 11: Procedure Management handlers
 *
 * create_procedure  (analyst) — generate and store a procedure from a Mustache template
 * get_procedure     (viewer)  — fetch a procedure by ID, optionally including version history
 * update_procedure  (admin)   — archive current version, re-render, increment version
 * list_procedures   (viewer)  — filtered, paginated list (no content column)
 * export_procedure  (analyst) — export as markdown or JSON
 */

import Mustache from "mustache";
import { getDb } from "../db/connection.js";
import { newId, now, addMonths, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";
import { loadTemplate, loadPartials, stripFrontmatter, markdownToHtml, renderHtmlDocument } from "./template-utils.js";
import { loadOrgProfileDefaults } from "./org-profile.js";

// ── Types ─────────────────────────────────────────────────────

interface ProcedureRow {
  id:                  string;
  procedure_type:      string;
  policy_id:           string | null;
  organisation_name:   string;
  scope:               string;
  owner:               string;
  approver:            string | null;
  status:              string;
  version:             number;
  content:             string;
  clause_mappings:     string | null;
  control_mappings:    string | null;
  related_controls:    string | null;
  review_cycle_months: number;
  effective_date:      string;
  next_review_date:    string;
  reviewed_by:         string | null;
  approved_by:         string | null;
  created_at:          string;
  updated_at:          string;
}

interface ProcedureVersionRow {
  id:            string;
  procedure_id:  string;
  version:       number;
  content:       string;
  change_summary: string | null;
  reviewed_by:   string | null;
  archived_at:   string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── create_procedure ──────────────────────────────────────────

export function handleCreateProcedure(args: Record<string, unknown>): ToolResult {
  const {
    type,
    organisation_name,
    scope,
    owner,
    approver,
    policy_id,
    related_controls,
    review_cycle_months = 12,
    effective_date,
  } = args as {
    type:                 string;
    organisation_name?:   string;
    scope?:               string;
    owner:                string;
    approver?:            string;
    policy_id?:           string;
    related_controls?:    string[];
    review_cycle_months?: number;
    effective_date:       string;
  };

  const db = getDb();

  // Auto-inject org profile defaults when caller omits organisation_name / scope
  const profileDefaults = loadOrgProfileDefaults(db);
  const resolvedOrgName = organisation_name ?? profileDefaults?.organisation_name;
  const resolvedScope   = scope           ?? profileDefaults?.scope;

  if (!resolvedOrgName || !resolvedScope) {
    throw businessRule(
      "organisation_name",
      "organisation_name and scope are required — supply them explicitly or call set_organization_profile first.",
    );
  }

  // Validate policy_id linkage
  let resolvedPolicyId: string | null = null;
  if (policy_id) {
    const policy = db
      .prepare("SELECT id, status FROM policies WHERE id = ?")
      .get(policy_id) as { id: string; status: string } | undefined;

    if (!policy) throw notFound("policy", policy_id);
    if (policy.status === "archived") {
      throw businessRule(
        "policy_id",
        `Cannot link to archived policy '${policy_id}'. Activate or create a new policy first.`,
      );
    }
    resolvedPolicyId = policy_id;
  }

  const id          = newId();
  const next_review = addMonths(new Date(effective_date), review_cycle_months);
  const ts          = now();

  // Load and render Mustache template
  const raw                                          = loadTemplate(type, "procedure-templates");
  const { template, clauseMappings, controlMappings } = stripFrontmatter(raw);

  const rendered = Mustache.render(template, {
    procedure_id:      id,
    organisation_name: resolvedOrgName,
    scope:             resolvedScope,
    owner,
    approver:          approver ?? "TBD",
    effective_date,
    next_review_date:  next_review,
    version:           "1.0",
    parent_policy_id:  resolvedPolicyId ?? "N/A",
    clause_mappings:   clauseMappings.join(", "),
    control_mappings:  controlMappings.join(", "),
  }, loadPartials());

  db.prepare(`
    INSERT INTO procedures
      (id, procedure_type, policy_id, organisation_name, scope, owner, approver,
       status, version, content, clause_mappings, control_mappings, related_controls,
       review_cycle_months, effective_date, next_review_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    type,
    resolvedPolicyId,
    resolvedOrgName,
    resolvedScope,
    owner,
    approver ?? null,
    rendered,
    JSON.stringify(clauseMappings),
    JSON.stringify(controlMappings),
    related_controls ? JSON.stringify(related_controls) : null,
    review_cycle_months,
    effective_date,
    next_review,
    ts,
    ts,
  );

  return ok({
    id,
    procedure_type:   type,
    policy_id:        resolvedPolicyId,
    organisation_name: resolvedOrgName,
    version:          1,
    status:           "draft",
    effective_date,
    next_review_date: next_review,
    clause_mappings:  clauseMappings,
    control_mappings: controlMappings,
    related_controls: related_controls ?? [],
    created_at:       ts,
    content_preview:  rendered.slice(0, 500) + (rendered.length > 500 ? "\n…(truncated)" : ""),
  });
}

// ── get_procedure ─────────────────────────────────────────────

export function handleGetProcedure(args: Record<string, unknown>): ToolResult {
  const { procedure_id, include_versions = false } = args as {
    procedure_id:      string;
    include_versions?: boolean;
  };

  const db  = getDb();
  const row = db
    .prepare("SELECT * FROM procedures WHERE id = ?")
    .get(procedure_id) as ProcedureRow | undefined;

  if (!row) throw notFound("procedure", procedure_id);

  const result: Record<string, unknown> = {
    ...row,
    clause_mappings:  fromJsonArray<string>(row.clause_mappings),
    control_mappings: fromJsonArray<string>(row.control_mappings),
    related_controls: fromJsonArray<string>(row.related_controls),
  };

  if (include_versions) {
    const versions = db
      .prepare(
        `SELECT id, version, change_summary, reviewed_by, archived_at
           FROM procedure_versions
          WHERE procedure_id = ?
          ORDER BY version DESC`,
      )
      .all(procedure_id) as Omit<ProcedureVersionRow, "content" | "procedure_id">[];
    result["versions"] = versions;
  }

  return ok(result);
}

// ── list_procedures ───────────────────────────────────────────

export function handleListProcedures(args: Record<string, unknown>): ToolResult {
  const {
    procedure_type,
    status,
    policy_id,
    overdue_only = false,
    limit  = 50,
    offset = 0,
  } = args as {
    procedure_type?: string;
    status?:         string;
    policy_id?:      string;
    overdue_only?:   boolean;
    limit?:          number;
    offset?:         number;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (procedure_type) { conditions.push("procedure_type = ?"); params.push(procedure_type); }
  if (status)         { conditions.push("status = ?");         params.push(status); }
  if (policy_id)      { conditions.push("policy_id = ?");      params.push(policy_id); }
  if (overdue_only)   {
    conditions.push("next_review_date < date('now')");
    conditions.push("status = 'active'");
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db    = getDb();

  const total = (
    db.prepare(`SELECT count(*) AS n FROM procedures ${where}`).get(...params) as { n: number }
  ).n;

  params.push(limit, offset);

  const rows = db
    .prepare(
      `SELECT id, procedure_type, policy_id, organisation_name, owner, approver,
              status, version, effective_date, next_review_date, review_cycle_months,
              created_at, updated_at
         FROM procedures ${where}
         ORDER BY next_review_date ASC, created_at DESC
         LIMIT ? OFFSET ?`,
    )
    .all(...params) as Omit<
      ProcedureRow,
      "content" | "scope" | "clause_mappings" | "control_mappings" | "related_controls" | "reviewed_by" | "approved_by"
    >[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = rows.map((p) => {
    const reviewDate = new Date(p.next_review_date);
    const diffMs     = reviewDate.getTime() - today.getTime();
    const daysUntil  = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { ...p, days_until_review: daysUntil, overdue: daysUntil < 0 };
  });

  return ok({ total, limit, offset, procedures: enriched });
}

// ── update_procedure ──────────────────────────────────────────

export function handleUpdateProcedure(args: Record<string, unknown>): ToolResult {
  const {
    procedure_id,
    scope,
    owner,
    approver,
    related_controls,
    reviewed_by,
    change_summary,
  } = args as {
    procedure_id:      string;
    scope?:            string;
    owner?:            string;
    approver?:         string;
    related_controls?: string[];
    reviewed_by:       string;
    change_summary:    string;
  };

  const db      = getDb();
  const current = db
    .prepare("SELECT * FROM procedures WHERE id = ?")
    .get(procedure_id) as ProcedureRow | undefined;

  if (!current) throw notFound("procedure", procedure_id);
  if (current.status === "archived") {
    throw businessRule("procedure", "Cannot update an archived procedure.");
  }

  const ts         = now();
  const newVersion = current.version + 1;

  // Archive current version
  db.prepare(`
    INSERT INTO procedure_versions
      (id, procedure_id, version, content, change_summary, reviewed_by, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newId(), procedure_id, current.version, current.content, change_summary, reviewed_by, ts);

  // Re-render template with updated fields
  const raw                                          = loadTemplate(current.procedure_type, "procedure-templates");
  const { template, clauseMappings, controlMappings } = stripFrontmatter(raw);

  const newScope = scope ?? current.scope;
  const newOwner = owner ?? current.owner;

  const rendered = Mustache.render(template, {
    procedure_id,
    organisation_name: current.organisation_name,
    scope:             newScope,
    owner:             newOwner,
    approver:          approver ?? current.approver ?? "TBD",
    effective_date:    current.effective_date,
    next_review_date:  current.next_review_date,
    version:           `${newVersion}.0`,
    parent_policy_id:  current.policy_id ?? "N/A",
    clause_mappings:   clauseMappings.join(", "),
    control_mappings:  controlMappings.join(", "),
  }, loadPartials());

  const newRelatedControls = related_controls
    ? JSON.stringify(related_controls)
    : current.related_controls;

  db.prepare(`
    UPDATE procedures SET
      scope            = COALESCE(?, scope),
      owner            = COALESCE(?, owner),
      approver         = COALESCE(?, approver),
      related_controls = COALESCE(?, related_controls),
      reviewed_by      = ?,
      version          = ?,
      content          = ?,
      clause_mappings  = ?,
      control_mappings = ?,
      updated_at       = ?
    WHERE id = ?
  `).run(
    scope    ?? null,
    owner    ?? null,
    approver ?? null,
    newRelatedControls,
    reviewed_by,
    newVersion,
    rendered,
    JSON.stringify(clauseMappings),
    JSON.stringify(controlMappings),
    ts,
    procedure_id,
  );

  return ok({
    id:           procedure_id,
    version:      newVersion,
    reviewed_by,
    change_summary,
    updated_at:   ts,
  });
}

// ── export_procedure ──────────────────────────────────────────

export function handleExportProcedure(args: Record<string, unknown>): ToolResult {
  const { procedure_id, format } = args as {
    procedure_id: string;
    format:       "markdown" | "json" | "html";
  };

  const db  = getDb();
  const row = db
    .prepare("SELECT * FROM procedures WHERE id = ?")
    .get(procedure_id) as ProcedureRow | undefined;

  if (!row) throw notFound("procedure", procedure_id);

  if (format === "html") {
    const db2      = getDb();
    const defaults = loadOrgProfileDefaults(db2);
    const bodyHtml = markdownToHtml(row.content);
    const html     = renderHtmlDocument(bodyHtml, {
      title:             row.procedure_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) + " Procedure",
      organisation_name: row.organisation_name,
      logo_url:          defaults?.logo_url,
      primary_color:     defaults?.primary_color,
      document_footer:   defaults?.document_footer,
      version:           String(row.version),
      effective_date:    row.effective_date,
      owner:             row.owner,
      doc_type:          "Procedure",
    });
    return ok({ format: "html", content: html });
  }

  if (format === "markdown") {
    const relatedControls = fromJsonArray<string>(row.related_controls);
    const controlsSection = relatedControls.length > 0
      ? `\n\n---\n\n## Related Controls\n\n${relatedControls.map((c) => `- ${c}`).join("\n")}`
      : "";

    return ok({ format: "markdown", content: row.content + controlsSection });
  }

  // JSON format — parse all JSON fields
  return ok({
    format: "json",
    procedure: {
      ...row,
      clause_mappings:  fromJsonArray<string>(row.clause_mappings),
      control_mappings: fromJsonArray<string>(row.control_mappings),
      related_controls: fromJsonArray<string>(row.related_controls),
    },
  });
}
