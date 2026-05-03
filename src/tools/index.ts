/**
 * iso27001-mcp — Tool registry & execution pipeline
 *
 * registerAllTools(server) wires all 43 tools into the MCP server with the
 * full security pipeline per §6 of the spec:
 *
 *   1. Extract API key from request meta or MCP_API_KEY env var
 *   2. validateKey(rawKey)          → keyHash
 *   3. checkRateLimit(keyHash)
 *   4. loadRole(keyHash)            → role
 *   5. assertPermission(role, tool)
 *   6. sanitiseParams(args)
 *   7. Call domain handler
 *   8. writeAuditEvent(...)         — in finally block (always runs)
 *   9. Return result or McpError.toToolResult()
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateKey, loadRole, listKeys, revokeKey } from "../auth/api-key.js";
import { assertPermission } from "../auth/rbac.js";
import { checkRateLimit } from "../security/rate-limiter.js";
import { sanitiseParams } from "../security/sanitise.js";
import { writeAuditEvent, buildParamsJson } from "../audit/logger.js";
import { McpError } from "../types/errors.js";
import { TOOL_SCHEMAS } from "../security/validate.js";
import { handleGetServerInfo } from "./server-info.js";
import { getDb } from "../db/connection.js";

// ── Types ─────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => ToolResult;

// ── extractShape ─────────────────────────────────────────────
// MCP SDK registerTool() expects a ZodRawShape, not a full ZodObject.
// Schemas built with .refine() are ZodEffects — unwrap one level to get
// the underlying ZodObject's shape.

function extractShape(schema: z.ZodTypeAny): z.ZodRawShape {
  if (schema instanceof z.ZodEffects) {
    return (schema.innerType() as z.ZodObject<z.ZodRawShape>).shape;
  }
  return (schema as z.ZodObject<z.ZodRawShape>).shape;
}

// ── ok / err helpers ──────────────────────────────────────────

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
}

function stub(toolName: string): ToolResult {
  return ok({
    status: "not_implemented",
    tool: toolName,
    message: `${toolName} will be implemented in Phase 5–6.`,
  });
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
};

// ── TOOL_HANDLERS ─────────────────────────────────────────────
// Real implementations for Group 8 (get_server_info) and
// Group 9 admin tools. All other groups are stubs for Phase 5–6.

const TOOL_HANDLERS: Record<string, ToolHandler> = {

  // ── Group 1: Control Registry (stubs) ────────────────────
  get_control:              (args) => stub(`get_control(${JSON.stringify(args)})`),
  list_controls:            (_)    => stub("list_controls"),
  search_controls:          (args) => stub(`search_controls("${(args as {query?: string}).query ?? ""}")`),
  get_control_attributes:   (args) => stub(`get_control_attributes(${JSON.stringify(args)})`),
  compare_versions:         (args) => stub(`compare_versions(${JSON.stringify(args)})`),
  get_clause_requirement:   (args) => stub(`get_clause_requirement(${JSON.stringify(args)})`),
  list_clause_requirements: (_)    => stub("list_clause_requirements"),

  // ── Group 2: Gap Analysis (stubs) ────────────────────────
  create_gap_assessment:        (_) => stub("create_gap_assessment"),
  update_control_status:        (_) => stub("update_control_status"),
  get_gap_summary:              (_) => stub("get_gap_summary"),
  list_gap_assessments:         (_) => stub("list_gap_assessments"),
  export_gap_report:            (_) => stub("export_gap_report"),
  generate_remediation_roadmap: (_) => stub("generate_remediation_roadmap"),
  archive_gap_assessment:       (_) => stub("archive_gap_assessment"),

  // ── Group 3: Risk Management (stubs) ─────────────────────
  create_risk:             (_) => stub("create_risk"),
  get_risk:                (_) => stub("get_risk"),
  update_risk:             (_) => stub("update_risk"),
  list_risks:              (_) => stub("list_risks"),
  get_risk_summary:        (_) => stub("get_risk_summary"),
  create_treatment_plan:   (_) => stub("create_treatment_plan"),
  update_treatment_status: (_) => stub("update_treatment_status"),
  generate_risk_register:  (_) => stub("generate_risk_register"),

  // ── Group 4: Policy Management (stubs) ───────────────────
  create_policy: (_) => stub("create_policy"),
  get_policy:    (_) => stub("get_policy"),
  update_policy: (_) => stub("update_policy"),
  list_policies: (_) => stub("list_policies"),

  // ── Group 5: Statement of Applicability (stubs) ──────────
  generate_soa:     (_) => stub("generate_soa"),
  update_soa_entry: (_) => stub("update_soa_entry"),
  export_soa:       (_) => stub("export_soa"),

  // ── Group 6: Audit Management (stubs) ────────────────────
  create_audit:             (_) => stub("create_audit"),
  record_finding:           (_) => stub("record_finding"),
  create_corrective_action: (_) => stub("create_corrective_action"),
  update_corrective_action: (_) => stub("update_corrective_action"),
  generate_audit_report:    (_) => stub("generate_audit_report"),

  // ── Group 7: Evidence Tracking (stubs) ───────────────────
  register_evidence: (_) => stub("register_evidence"),
  list_evidence:     (_) => stub("list_evidence"),
  get_evidence_gaps: (_) => stub("get_evidence_gaps"),
  link_jira_ticket:  (_) => stub("link_jira_ticket"),
  link_github_issue: (_) => stub("link_github_issue"),

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
    const sql   = `SELECT id, timestamp, tool, role, outcome, error_message, duration_ms, row_hash
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
};

// ── registerAllTools ──────────────────────────────────────────

/**
 * Register all 43 ISO 27001 MCP tools with the server.
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

      // ── Step 1: extract API key from request meta or env ──
      const rawKey: string =
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
        // ── Step 2: auth — validate API key ──────────────────
        keyHash = validateKey(rawKey);

        // ── Step 3: rate limit ────────────────────────────────
        checkRateLimit(keyHash);

        // ── Step 4: load role ─────────────────────────────────
        role = loadRole(keyHash);

        // ── Step 5: RBAC ──────────────────────────────────────
        assertPermission(role as "viewer" | "analyst" | "admin", toolName);

        // ── Step 6: sanitise free-text inputs ─────────────────
        const { sanitisedFields } = sanitiseParams(args as Record<string, unknown>);

        // ── Step 7: call domain handler ───────────────────────
        result = handler(args as Record<string, unknown>);

        outcome = result.isError ? "error" : "success";
        if (result.isError) {
          try {
            const parsed = JSON.parse(result.content[0].text) as { message?: string };
            errorMessage = parsed.message ?? "handler returned isError=true";
          } catch {
            errorMessage = "handler returned isError=true";
          }
        }

        // ── Step 8 (success path): write audit event ──────────
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
