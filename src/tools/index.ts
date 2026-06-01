/**
 * iso27001-mcp — Tool registry & execution pipeline
 *
 * registerAllTools(server) wires all 63 tools into the MCP server with the
 * full security pipeline per §6 of the spec:
 *
 *   1. Extract credential from _meta.apiKey or MCP_API_KEY env var
 *   2a. If it is an SSE session token → lookupSessionToken() → { keyHash, role }
 *       (auth already validated at /sse connect time; raw key never re-transmitted)
 *   2b. Otherwise → validateKey(rawKey) → keyHash, then loadRole(keyHash)
 *   3. checkRateLimit(keyHash)
 *   4. assertPermission(role, tool)
 *   5. sanitiseParams(args)
 *   6. Call domain handler
 *   7. writeAuditEvent(...)         — always runs (success + error paths)
 *   8. Return result or McpError.toToolResult()
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateKey, loadRole, listKeys, revokeKey } from "../auth/api-key.js";
import { isSessionToken, lookupSessionToken } from "../auth/session-store.js";
import { assertPermission } from "../auth/rbac.js";
import { checkRateLimit } from "../security/rate-limiter.js";
import { sanitiseParams } from "../security/sanitise.js";
import { writeAuditEvent, buildParamsJson } from "../audit/logger.js";
import { McpError } from "../types/errors.js";
import { TOOL_SCHEMAS } from "../security/validate.js";
import { handleGetServerInfo } from "./server-info.js";
import { getDb } from "../db/connection.js";

// ── Group 1: Control Registry ─────────────────────────────────
import {
  handleGetControl, handleListControls, handleSearchControls,
  handleGetControlAttributes, handleCompareVersions,
  handleGetClauseRequirement, handleListClauseRequirements,
} from "./controls.js";

// ── Group 2: Gap Analysis ─────────────────────────────────────
import {
  handleCreateGapAssessment, handleUpdateControlStatus, handleGetGapSummary,
  handleListGapAssessments, handleExportGapReport,
  handleGenerateRemediationRoadmap, handleArchiveGapAssessment,
} from "./gap-analysis.js";

// ── Group 3: Risk Management ──────────────────────────────────
import {
  handleCreateRisk, handleGetRisk, handleUpdateRisk, handleListRisks,
  handleGetRiskSummary, handleCreateTreatmentPlan,
  handleUpdateTreatmentStatus, handleGenerateRiskRegister,
} from "./risks.js";

// ── Group 4: Policy Management ────────────────────────────────
import {
  handleCreatePolicy, handleGetPolicy, handleUpdatePolicy, handleListPolicies,
} from "./policies.js";

// ── Group 5: Statement of Applicability ──────────────────────
import {
  handleGenerateSoa, handleUpdateSoaEntry, handleExportSoa,
} from "./soa.js";

// ── Group 6: Audit Management ─────────────────────────────────
import {
  handleCreateAudit, handleRecordFinding, handleCreateCorrectiveAction,
  handleUpdateCorrectiveAction, handleGenerateAuditReport,
} from "./audit-management.js";

// ── Group 7: Evidence Tracking ────────────────────────────────
import {
  handleRegisterEvidence, handleListEvidence, handleGetEvidenceGaps,
  handleLinkJiraTicket, handleLinkGithubIssue,
} from "./evidence-tracking.js";

// ── Group 10: Organization Profile ───────────────────────────
import {
  handleSetOrganizationProfile, handleGetOrganizationProfile,
} from "./org-profile.js";

// ── Group 11: Procedure Management ───────────────────────────
import {
  handleCreateProcedure, handleGetProcedure, handleUpdateProcedure,
  handleListProcedures, handleExportProcedure,
} from "./procedures.js";

// ── Group 12: Management Review (Clause 9.3) ─────────────────
import {
  handleCreateManagementReview, handleRecordReviewInput, handleRecordReviewOutput,
  handleCompleteManagementReview, handleGetManagementReview, handleListManagementReviews,
} from "./management-review.js";

// ── Group 13: Improvement Plan (Clause 10.1) ─────────────────
import {
  handleCreateImprovementOpportunity, handleUpdateImprovementOpportunity,
  handleGetImprovementOpportunity, handleListImprovementOpportunities,
} from "./improvement-plan.js";

// ── Group 14: Evidence Templates ──────────────────────────────
import {
  handleGenerateEvidenceDocument, handleGetEvidenceDocument,
  handleListEvidenceDocuments,
} from "./evidence-templates.js";

// ── Types ─────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

// ── extractShape ─────────────────────────────────────────────
// MCP SDK registerTool() expects a ZodRawShape, not a full ZodObject.
// Schemas built with .refine() are ZodEffects — loop to unwrap ALL
// levels so nested .refine().refine() chains don't silently lose shape.
//
// unwrapFieldSchema() additionally unwraps field-level ZodEffects
// (ZodPreprocess / ZodTransform) so the MCP SDK can emit correct
// JSON Schema for each field and Claude receives accurate type hints.
// Runtime validation still uses the original schema.safeParse() in
// the security pipeline — this only affects what Claude sees.

function unwrapFieldSchema(field: z.ZodTypeAny): z.ZodTypeAny {
  // Unwrap preprocess / transform / refine to the representable inner type
  if (field instanceof z.ZodEffects) {
    return unwrapFieldSchema(field.innerType() as z.ZodTypeAny);
  }
  // Preserve the optional wrapper, but unwrap what's inside it
  if (field instanceof z.ZodOptional) {
    return unwrapFieldSchema(field.unwrap()).optional();
  }
  // Preserve the default wrapper, but unwrap what's inside it
  if (field instanceof z.ZodDefault) {
    const inner    = unwrapFieldSchema(field.removeDefault());
    const defValue = (field._def as { defaultValue: () => unknown }).defaultValue();
    return inner.optional().default(defValue);
  }
  return field;
}

function extractShape(schema: z.ZodTypeAny): z.ZodRawShape {
  let s: z.ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) {
    s = s.innerType() as z.ZodTypeAny;
  }
  const rawShape = (s as z.ZodObject<z.ZodRawShape>).shape;

  // Unwrap field-level ZodEffects so the SDK generates correct JSON Schema
  const cleanShape: z.ZodRawShape = {};
  for (const [key, val] of Object.entries(rawShape)) {
    cleanShape[key] = unwrapFieldSchema(val as z.ZodTypeAny);
  }
  return cleanShape;
}

// ── ok / err helpers ──────────────────────────────────────────

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
}

// ── TOOL_DESCRIPTIONS ─────────────────────────────────────────
// One concise sentence per tool, following the spec §7 naming.

const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Group 1 — Control Registry (read-only, viewer+)
  get_control:
    "Retrieve a single ISO 27001 control by control_id and optional version (2022 or 2013).",
  list_controls:
    "List ISO 27001 controls with optional filters: version, theme, control_type, new_in_2022, cybersecurity_concept, and pagination.",
  search_controls:
    "Full-text search across control names, descriptions, and guidance using the FTS5 index.",
  get_control_attributes:
    "Retrieve the 2022 attribute tags for a control: information_security_properties, cybersecurity_concepts, operational_capabilities, security_domains.",
  compare_versions:
    "Show the mapping relationship between a 2013 control and its 2022 equivalent(s), or vice versa.",
  get_clause_requirement:
    "Fetch a single ISO 27001:2022 clause requirement by clause_id, optionally including sub-clauses.",
  list_clause_requirements:
    "List ISO 27001:2022 clause requirements (clauses 4–10), optionally filtered by parent clause.",

  // Group 2 — Gap Analysis (reads: viewer+, writes: analyst+)
  create_gap_assessment:
    "Create a new gap assessment against ISO 27001:2022 or 2013 controls for a defined ISMS scope.",
  update_control_status:
    "Set the implementation status of a control within a gap assessment (implemented, partial, not_implemented, na, not_started).",
  get_gap_summary:
    "Return aggregate compliance statistics for a gap assessment, optionally broken down by theme, control_type, or cybersecurity_concept.",
  list_gap_assessments:
    "List gap assessments filtered by status (active, archived, all).",
  export_gap_report:
    "Export a full gap assessment report in markdown, CSV, or JSON format.",
  generate_remediation_roadmap:
    "Generate a prioritised remediation roadmap from a gap assessment, grouped by risk level and theme.",
  archive_gap_assessment:
    "Archive a completed or superseded gap assessment with an optional reason.",

  // Group 3 — Risk Management (reads: viewer+, writes: analyst+)
  create_risk:
    "Register a new information security risk with asset, threat, vulnerability, likelihood (1–5), and impact (1–5).",
  get_risk:
    "Retrieve a risk record by ID, optionally including its treatment plans.",
  update_risk:
    "Update mutable fields of an existing risk (asset, threat, vulnerability, likelihood, impact, owner, status, related_controls).",
  list_risks:
    "List risks with optional filters: risk_level, status, owner, and pagination.",
  get_risk_summary:
    "Return aggregate risk statistics: count by level, status, and treatment type.",
  create_treatment_plan:
    "Create a risk treatment plan (mitigate, accept, avoid, or transfer) with owner, due date, and optionally residual risk scores.",
  update_treatment_status:
    "Update the status and evidence reference for an existing risk treatment plan.",
  generate_risk_register:
    "Export the full risk register in markdown, CSV, or JSON format with optional level/status filters.",

  // Group 4 — Policy Management (reads: viewer+, create: analyst+, update: admin)
  create_policy:
    "Generate a new ISMS policy document from a Mustache template using organisation_name, scope, owner, and effective_date.",
  get_policy:
    "Retrieve a policy record by ID, optionally including version history.",
  update_policy:
    "Create a new version of an existing policy with scope/owner changes, reviewed_by, and change_summary. Requires admin role.",
  list_policies:
    "List policies with optional filters: status, type, owner, overdue_only, and pagination.",

  // Group 5 — Statement of Applicability (analyst+)
  generate_soa:
    "Generate a Statement of Applicability from a gap assessment, pre-populating inclusion/exclusion for all controls.",
  update_soa_entry:
    "Update an SoA entry's inclusion status, justification, implementation status, and responsible party.",
  export_soa:
    "Export the Statement of Applicability in markdown or CSV format.",

  // Group 6 — Audit Management (reads: viewer+, writes: admin)
  create_audit:
    "Create an internal ISMS audit record with auditor, planned date, and controls/clauses in scope.",
  record_finding:
    "Record an audit finding (NC, observation, or OFI) against a clause or control.",
  create_corrective_action:
    "Create a corrective action request (CAR) linked to an audit finding with owner and due date.",
  update_corrective_action:
    "Update a corrective action's status, root cause, evidence reference, or effectiveness verification.",
  generate_audit_report:
    "Export an audit report including findings and CAR status in markdown or JSON format.",

  // Group 7 — Evidence Tracking (reads: viewer+, writes: analyst+)
  register_evidence:
    "Register an evidence artefact linked to a control with type, source URL, collector, and optional expiry date.",
  list_evidence:
    "List evidence records for a control, optionally filtered by status (current, stale, expired).",
  get_evidence_gaps:
    "Return a list of controls in a gap assessment that have no current evidence records.",
  link_jira_ticket:
    "Link an evidence record to an existing Jira ticket by key, or create a new ticket from a summary.",
  link_github_issue:
    "Link an evidence record to an existing GitHub issue by number, or create a new issue from a title and body.",

  // Group 8 — Server Info (viewer+)
  get_server_info:
    "Return server version, build provenance, control data checksums, and live database statistics.",

  // Group 9 — Admin & Key Management (admin only)
  query_audit_log:
    "Query the tamper-evident audit log with optional filters: date range, tool, outcome, role, key_hash.",
  list_api_keys:
    "List all API keys with their metadata (label, role, status, expiry). Never returns key hashes.",
  revoke_api_key:
    "Revoke an API key by label, preventing all future use.",

  // Group 10 — Organization Profile
  set_organization_profile:
    "Upsert the singleton organization profile (legal name, jurisdiction, ISMS scope, RACI roles). Used by create_policy and create_procedure to auto-inject org defaults.",
  get_organization_profile:
    "Retrieve the organization profile. Returns { profile: null } if no profile has been set yet.",

  // Group 11 — Procedure Management (reads: viewer+, create: analyst+, update: admin)
  create_procedure:
    "Generate a new ISMS procedure document from a Mustache template. Optionally links to a parent policy. Falls back to org profile for organisation_name and scope if not supplied.",
  get_procedure:
    "Retrieve a procedure record by ID, optionally including version history.",
  update_procedure:
    "Archive the current procedure version and re-render with updated fields, incrementing the version number. Requires admin role.",
  list_procedures:
    "List procedures with optional filters: procedure_type, status, policy_id, overdue_only, and pagination.",
  export_procedure:
    "Export a procedure as a markdown document (with related controls appended) or as structured JSON.",

  // Group 12 — Management Review, Clause 9.3 (reads: viewer+, writes: admin)
  create_management_review:
    "Schedule a new management review (ISO 27001:2022 Clause 9.3) with title, date, and reviewers list.",
  record_review_input:
    "Record one of the 7 mandatory Clause 9.3.2 input categories for a management review. Upserts on re-submission; advances status to in_progress on first input.",
  record_review_output:
    "Record a Clause 9.3.3 output decision (improvement_decision or isms_change_decision) for a management review.",
  complete_management_review:
    "Mark a management review as completed. Enforces ISO 27001:2022 §9.3.2: all 7 input categories must be recorded, and at least one output must be present.",
  get_management_review:
    "Retrieve a management review record with all inputs, outputs, and a completion-progress summary.",
  list_management_reviews:
    "List management reviews with optional status filter and pagination.",

  // Group 13 — Improvement Plan, Clause 10.1 (reads: viewer+, writes: analyst+)
  create_improvement_opportunity:
    "Register a proactive improvement opportunity (ISO 27001:2022 Clause 10.1) with source, priority, owner, and optional target date. Not linked to a nonconformity.",
  update_improvement_opportunity:
    "Advance an improvement opportunity's status (forward-only: open → in_progress → implemented → closed) or update owner, target date, priority, or description.",
  get_improvement_opportunity:
    "Retrieve a single improvement opportunity by ID.",
  list_improvement_opportunities:
    "List improvement opportunities with optional filters (status, source, priority, review_id) and a backlog health rating (excellent/good/fair/needs_attention/at_risk).",

  // Group 14 — Evidence Templates (reads: viewer+, generate: analyst+)
  generate_evidence_document:
    "Render one of 6 Mustache evidence templates (access_review_attestation, training_acknowledgement, supplier_security_questionnaire, incident_post_mortem, bcp_test_report, risk_treatment_sign_off) with org-profile auto-injection. Returns rendered Markdown and simultaneously registers an evidence record.",
  get_evidence_document:
    "Retrieve a previously generated evidence document by ID, including its rendered Markdown content and template variables used.",
  list_evidence_documents:
    "List generated evidence documents with optional filters: template_type, generated_by, control_id, and pagination.",
};

// ── TOOL_HANDLERS ─────────────────────────────────────────────
// Real implementations for Group 8 (get_server_info) and
// Group 9 admin tools. All other groups are stubs for Phase 5–6.

const TOOL_HANDLERS: Record<string, ToolHandler> = {

  // ── Group 1: Control Registry ────────────────────────────
  get_control:              handleGetControl,
  list_controls:            handleListControls,
  search_controls:          handleSearchControls,
  get_control_attributes:   handleGetControlAttributes,
  compare_versions:         handleCompareVersions,
  get_clause_requirement:   handleGetClauseRequirement,
  list_clause_requirements: handleListClauseRequirements,

  // ── Group 2: Gap Analysis ─────────────────────────────────
  create_gap_assessment:        handleCreateGapAssessment,
  update_control_status:        handleUpdateControlStatus,
  get_gap_summary:              handleGetGapSummary,
  list_gap_assessments:         handleListGapAssessments,
  export_gap_report:            handleExportGapReport,
  generate_remediation_roadmap: handleGenerateRemediationRoadmap,
  archive_gap_assessment:       handleArchiveGapAssessment,

  // ── Group 3: Risk Management ──────────────────────────────
  create_risk:             handleCreateRisk,
  get_risk:                handleGetRisk,
  update_risk:             handleUpdateRisk,
  list_risks:              handleListRisks,
  get_risk_summary:        handleGetRiskSummary,
  create_treatment_plan:   handleCreateTreatmentPlan,
  update_treatment_status: handleUpdateTreatmentStatus,
  generate_risk_register:  handleGenerateRiskRegister,

  // ── Group 4: Policy Management ────────────────────────────
  create_policy: handleCreatePolicy,
  get_policy:    handleGetPolicy,
  update_policy: handleUpdatePolicy,
  list_policies: handleListPolicies,

  // ── Group 5: Statement of Applicability ──────────────────
  generate_soa:     handleGenerateSoa,
  update_soa_entry: handleUpdateSoaEntry,
  export_soa:       handleExportSoa,

  // ── Group 6: Audit Management ─────────────────────────────
  create_audit:             handleCreateAudit,
  record_finding:           handleRecordFinding,
  create_corrective_action: handleCreateCorrectiveAction,
  update_corrective_action: handleUpdateCorrectiveAction,
  generate_audit_report:    handleGenerateAuditReport,

  // ── Group 7: Evidence Tracking ────────────────────────────
  register_evidence: handleRegisterEvidence,
  list_evidence:     handleListEvidence,
  get_evidence_gaps: handleGetEvidenceGaps,
  link_jira_ticket:  handleLinkJiraTicket,
  link_github_issue: handleLinkGithubIssue,

  // ── Group 8: Server Info ──────────────────────────────────
  get_server_info: (_args) => handleGetServerInfo(),

  // ── Group 9: Admin & Key Management ──────────────────────
  query_audit_log: (args) => {
    const db = getDb();
    const {
      start_date, end_date, tool, outcome, role, key_hash,
      limit = 50, offset = 0,
    } = args as {
      start_date?: string; end_date?: string; tool?: string;
      outcome?: string; role?: string; key_hash?: string;
      limit?: number; offset?: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (start_date) { conditions.push("timestamp >= ?"); params.push(start_date); }
    if (end_date)   { conditions.push("timestamp <= ?"); params.push(end_date + "T23:59:59Z"); }
    if (tool)       { conditions.push("tool = ?");       params.push(tool); }
    if (outcome)    { conditions.push("outcome = ?");    params.push(outcome); }
    if (role)       { conditions.push("role = ?");       params.push(role); }
    if (key_hash)   { conditions.push("key_hash = ?");   params.push(key_hash); }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const sql   = `SELECT id, timestamp, tool, role, outcome, error_message, duration_ms, prev_hash, row_hash
                   FROM audit_log ${where}
                   ORDER BY timestamp DESC
                   LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    return ok({ total: rows.length, offset, limit, entries: rows });
  },

  list_api_keys: (_args) => {
    const keys = listKeys();
    return ok({ count: keys.length, keys });
  },

  revoke_api_key: (args) => {
    const { label } = args as { label: string };
    revokeKey(label);
    return ok({ revoked: true, label });
  },

  // ── Group 10: Organization Profile ───────────────────────────
  set_organization_profile: handleSetOrganizationProfile,
  get_organization_profile: handleGetOrganizationProfile,

  // ── Group 11: Procedure Management ───────────────────────────
  create_procedure: handleCreateProcedure,
  get_procedure:    handleGetProcedure,
  update_procedure: handleUpdateProcedure,
  list_procedures:  handleListProcedures,
  export_procedure: handleExportProcedure,

  // ── Group 12: Management Review (Clause 9.3) ─────────────────
  create_management_review:   handleCreateManagementReview,
  record_review_input:        handleRecordReviewInput,
  record_review_output:       handleRecordReviewOutput,
  complete_management_review: handleCompleteManagementReview,
  get_management_review:      handleGetManagementReview,
  list_management_reviews:    handleListManagementReviews,

  // ── Group 13: Improvement Plan (Clause 10.1) ──────────────────
  create_improvement_opportunity: handleCreateImprovementOpportunity,
  update_improvement_opportunity: handleUpdateImprovementOpportunity,
  get_improvement_opportunity:    handleGetImprovementOpportunity,
  list_improvement_opportunities: handleListImprovementOpportunities,

  // ── Group 14: Evidence Templates ──────────────────────────────
  generate_evidence_document: handleGenerateEvidenceDocument,
  get_evidence_document:      handleGetEvidenceDocument,
  list_evidence_documents:    handleListEvidenceDocuments,
};

// ── registerAllTools ──────────────────────────────────────────

/**
 * Register all 63 ISO 27001 MCP tools with the server.
 * Each tool callback runs the full security pipeline.
 */
export function registerAllTools(server: McpServer): void {
  for (const [toolName, description] of Object.entries(TOOL_DESCRIPTIONS)) {
    const schema  = TOOL_SCHEMAS[toolName];
    const handler = TOOL_HANDLERS[toolName];

    if (!schema || !handler) {
      console.error(`[tools] WARNING: missing schema or handler for '${toolName}' — skipping`);
      continue;
    }

    const shape = extractShape(schema);

    // Each tool gets the same pipeline wrapper
    server.tool(toolName, description, shape, async (args, extra) => {
      const startMs = Date.now();

      // ── Step 1: extract credential from request meta or env ──
      const credential: string =
        ((extra as unknown as { _meta?: { apiKey?: string } })._meta?.apiKey) ??
        process.env["MCP_API_KEY"] ??
        "";

      // Audit scaffolding — filled in as pipeline progresses
      let keyHash      = "";
      let role         = "unknown";
      let outcome: "success" | "denied" | "error" = "error";
      let errorMessage: string | null = null;
      let result: ToolResult;

      try {
        // ── Step 2: auth ──────────────────────────────────────
        // SSE sessions use an opaque session token that maps to a pre-validated
        // { keyHash, role } — no raw key is re-transmitted or re-HMAC'd.
        // Stdio / direct API calls use a raw iso27001_... key as before.
        if (isSessionToken(credential)) {
          const session = lookupSessionToken(credential);
          if (!session) {
            throw new McpError({ error_code: "AUTH_INVALID", message: "Session token is invalid or expired" });
          }
          keyHash = session.keyHash;
          role    = session.role;
        } else {
          keyHash = validateKey(credential);
          role    = loadRole(keyHash);
        }

        // ── Step 3: rate limit ────────────────────────────────
        checkRateLimit(keyHash);

        // ── Step 4: RBAC ──────────────────────────────────────
        assertPermission(role as "viewer" | "analyst" | "admin", toolName);

        // ── Step 5: sanitise free-text inputs ─────────────────
        const { sanitisedFields } = sanitiseParams(args as Record<string, unknown>);

        // ── Step 6: call domain handler ───────────────────────
        result = await handler(args as Record<string, unknown>);

        outcome = result.isError ? "error" : "success";
        if (result.isError) {
          try {
            const parsed = JSON.parse(result.content[0].text) as { message?: string };
            errorMessage = parsed.message ?? "handler returned isError=true";
          } catch {
            errorMessage = "handler returned isError=true";
          }
        }

        // ── Step 7 (success path): write audit event ──────────
        writeAuditEvent({
          tool:          toolName,
          key_hash:      keyHash,
          role,
          params_json:   buildParamsJson(args as Record<string, unknown>, sanitisedFields),
          outcome,
          error_message: errorMessage,
          duration_ms:   Date.now() - startMs,
        });

        return result;

      } catch (err) {
        if (err instanceof McpError) {
          outcome      = err.error_code === "RBAC_DENIED" ? "denied" : "error";
          errorMessage = err.message;
          result       = err.toToolResult();
        } else {
          outcome      = "error";
          errorMessage = err instanceof Error ? err.message : String(err);
          result = {
            content: [{ type: "text", text: JSON.stringify({
              error_code:  "INTERNAL_ERROR",
              message:     errorMessage,
              http_status: 500,
            }) }],
            isError: true,
          };
        }

        // ── Step 8 (error path): always write audit event ─────
        try {
          writeAuditEvent({
            tool:          toolName,
            key_hash:      keyHash,
            role,
            params_json:   buildParamsJson(args as Record<string, unknown>),
            outcome,
            error_message: errorMessage,
            duration_ms:   Date.now() - startMs,
          });
        } catch (auditErr) {
          console.error("[tools] Failed to write audit event:", auditErr);
        }

        return result;
      }
    });
  }

  const count = Object.keys(TOOL_DESCRIPTIONS).length;
  console.error(`[tools] Registered ${count} tools.`);
}
