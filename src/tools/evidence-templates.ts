/**
 * iso27001-mcp — Group 14: Evidence Templates handlers
 *
 * generate_evidence_document — render a Mustache evidence template,
 *   auto-register in the evidence table, and store the rendered doc.
 * get_evidence_document      — retrieve a generated document by ID.
 * list_evidence_documents    — paginated list with optional filters.
 *
 * Uses the same loadTemplate / stripFrontmatter / Mustache pipeline
 * as policies.ts and procedures.ts, with org-profile auto-injection.
 */

import Mustache              from "mustache";
import { getDb }             from "../db/connection.js";
import { newId, now, toJson, fromJsonArray } from "../db/dal.js";
import { notFound }          from "../types/errors.js";
import { ok, type ToolResult } from "../types/result.js";
import { loadTemplate, loadPartials, stripFrontmatter } from "./template-utils.js";
import { loadOrgProfileDefaults }         from "./org-profile.js";

// ── Types ─────────────────────────────────────────────────────

interface GeneratedEvidenceRow {
  id:                string;
  template_type:     string;
  title:             string;
  content:           string;
  organisation_name: string;
  generated_by:      string;
  clause_mappings:   string | null;   // JSON array
  control_mappings:  string | null;   // JSON array
  template_vars:     string;          // JSON object
  evidence_id:       string | null;
  created_at:        string;
}


// ── Evidence type mapping ─────────────────────────────────────
// Maps each template type to the closest existing evidence.type value.

const EVIDENCE_TYPE_MAP: Record<string, string> = {
  access_review_attestation:    "audit_report",
  training_acknowledgement:     "training_record",
  supplier_security_questionnaire: "report",
  incident_post_mortem:         "report",
  bcp_test_report:              "report",
  risk_treatment_sign_off:      "report",
};

// ── RACI helper ───────────────────────────────────────────────
// Load full org profile RACI roles for template injection.

const ORG_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

interface OrgProfileRaci {
  ciso:             string;
  dpo:              string;
  data_owner:       string;
  isms_manager:     string;
  internal_auditor: string;
}

function loadOrgRaci(db: ReturnType<typeof getDb>): OrgProfileRaci {
  const row = db
    .prepare("SELECT raci_roles, isms_scope_statement FROM organization_profile WHERE id = ?")
    .get(ORG_PROFILE_ID) as
    | { raci_roles: string; isms_scope_statement: string }
    | undefined;

  if (!row) {
    return { ciso: "", dpo: "", data_owner: "", isms_manager: "", internal_auditor: "" };
  }

  try {
    const raci = JSON.parse(row.raci_roles) as Partial<OrgProfileRaci>;
    return {
      ciso:             raci.ciso             ?? "",
      dpo:              raci.dpo              ?? "",
      data_owner:       raci.data_owner       ?? "",
      isms_manager:     raci.isms_manager     ?? "",
      internal_auditor: raci.internal_auditor ?? "",
    };
  } catch {
    return { ciso: "", dpo: "", data_owner: "", isms_manager: "", internal_auditor: "" };
  }
}

function loadIsmsScope(db: ReturnType<typeof getDb>): string {
  const row = db
    .prepare("SELECT isms_scope_statement FROM organization_profile WHERE id = ?")
    .get(ORG_PROFILE_ID) as { isms_scope_statement: string } | undefined;
  return row?.isms_scope_statement ?? "";
}

// ── Handlers ──────────────────────────────────────────────────

export function handleGenerateEvidenceDocument(args: Record<string, unknown>): ToolResult {
  const {
    template_type,
    title,
    generated_by,
    organisation_name: callerOrgName,
    control_id,
    vars = {},
  } = args as {
    template_type:      string;
    title:              string;
    generated_by:       string;
    organisation_name?: string;
    control_id?:        string;
    vars?:              Record<string, string>;
  };

  const db           = getDb();
  const orgDefaults  = loadOrgProfileDefaults(db);
  const raci         = loadOrgRaci(db);
  const ismsScope    = loadIsmsScope(db);

  // Resolve organisation_name: caller → org profile → empty string
  const organisation_name =
    callerOrgName ??
    orgDefaults?.organisation_name ??
    "";

  // Load and parse the Mustache template
  const raw = loadTemplate(template_type, "evidence-templates");
  const { template, clauseMappings, controlMappings } = stripFrontmatter(raw);

  // Build the Mustache view — org profile injected first, caller vars override
  const today = now().slice(0, 10);  // YYYY-MM-DD
  const view: Record<string, string> = {
    // Org-profile auto-injections
    organisation_name,
    isms_scope_statement: ismsScope,
    ciso:             raci.ciso,
    dpo:              raci.dpo,
    data_owner:       raci.data_owner,
    isms_manager:     raci.isms_manager,
    internal_auditor: raci.internal_auditor,
    // Document-level fields
    title,
    generated_by,
    generated_date: today,
    // Caller-supplied template-specific variables (override org defaults if clashing)
    ...vars,
  };

  // Add clause/control mappings to view so approver_signature partial can render them
  const viewWithMappings = {
    ...view,
    clause_mappings:  clauseMappings.join(", "),
    control_mappings: controlMappings.join(", "),
  };

  const content = Mustache.render(template, viewWithMappings, loadPartials());

  const ts  = now();
  const docId = newId();

  // Auto-register in the evidence table
  const evidenceType = EVIDENCE_TYPE_MAP[template_type] ?? "report";
  const evidenceId   = newId();

  // Use control_id if provided, otherwise use a sentinel value meaningful for gap queries
  const evidenceControlId = control_id ?? "general";

  db.prepare(`
    INSERT INTO evidence
      (id, control_id, type, description, source_url, collected_by, collected_date,
       expiry_date, jira_key, jira_url, github_issue_url, github_issue_number,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run(
    evidenceId,
    evidenceControlId,
    evidenceType,
    title,
    generated_by,
    today,
    ts, ts,
  );

  // Store the generated document
  db.prepare(`
    INSERT INTO generated_evidence
      (id, template_type, title, content, organisation_name, generated_by,
       clause_mappings, control_mappings, template_vars, evidence_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docId,
    template_type,
    title,
    content,
    organisation_name,
    generated_by,
    toJson(clauseMappings),
    toJson(controlMappings),
    JSON.stringify(vars),
    evidenceId,
    ts,
  );

  return ok({
    document_id:      docId,
    evidence_id:      evidenceId,
    template_type,
    title,
    organisation_name,
    clause_mappings:  clauseMappings,
    control_mappings: controlMappings,
    generated_by,
    generated_at:     ts,
    content,
  });
}

export function handleGetEvidenceDocument(args: Record<string, unknown>): ToolResult {
  const { document_id } = args as { document_id: string };

  const db  = getDb();
  const row = db
    .prepare("SELECT * FROM generated_evidence WHERE id = ?")
    .get(document_id) as GeneratedEvidenceRow | undefined;

  if (!row) throw notFound("evidence_document", document_id);

  return ok({
    ...row,
    clause_mappings:  fromJsonArray<string>(row.clause_mappings),
    control_mappings: fromJsonArray<string>(row.control_mappings),
    template_vars:    JSON.parse(row.template_vars) as Record<string, string>,
  });
}

export function handleListEvidenceDocuments(args: Record<string, unknown>): ToolResult {
  const { template_type, generated_by, control_id, limit = 50, offset = 0 } = args as {
    template_type?: string;
    generated_by?:  string;
    control_id?:    string;
    limit?:         number;
    offset?:        number;
  };

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (template_type) { conditions.push("g.template_type = ?"); params.push(template_type); }
  if (generated_by)  { conditions.push("g.generated_by = ?");  params.push(generated_by); }

  // control_id filter joins to the evidence table via evidence_id
  if (control_id) {
    conditions.push("e.control_id = ?");
    params.push(control_id);
  }

  const join  = control_id ? "LEFT JOIN evidence e ON e.id = g.evidence_id" : "";
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const rows = db.prepare(`
    SELECT g.id, g.template_type, g.title, g.organisation_name,
           g.generated_by, g.evidence_id, g.created_at,
           g.clause_mappings, g.control_mappings
      FROM generated_evidence g
      ${join}
    ${where}
    ORDER BY g.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as GeneratedEvidenceRow[];

  return ok({
    total:  rows.length,
    offset,
    limit,
    documents: rows.map((r) => ({
      ...r,
      clause_mappings:  fromJsonArray<string>(r.clause_mappings),
      control_mappings: fromJsonArray<string>(r.control_mappings),
    })),
  });
}
