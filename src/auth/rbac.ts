/**
 * iso27001-mcp — Role-Based Access Control
 *
 * Permission matrix covering all 52 tools × 3 roles.
 * Roles are hierarchical: admin ⊇ analyst ⊇ viewer.
 * 13 read-only tools have been retired to MCP Resources (iso27001:// URIs).
 *
 * checkPermission(role, toolName) — returns true if allowed
 * minimumRole(toolName)           — returns the minimum role needed
 * assertPermission(role, toolName) — throws RBAC_DENIED if not allowed
 */

import type { Role } from "./api-key.js";
import { rbacDenied } from "../types/errors.js";

// ── Role hierarchy ────────────────────────────────────────────

export const ROLE_LEVEL: Record<Role, number> = {
  viewer:  0,
  analyst: 1,
  admin:   2,
};

// ── Minimum required role per tool ───────────────────────────
// Source of truth: §10 RBAC matrix + individual tool definitions in §7

const TOOL_MIN_ROLE: Record<string, Role> = {

  // ── Group 1: Control Registry ────────────────────────────
  // get_control → retired to iso27001://control/{control_id}
  // get_clause_requirement → retired to iso27001://clause/{clause_id}
  list_controls:             "viewer",
  search_controls:           "viewer",
  get_control_attributes:    "viewer",
  compare_versions:          "viewer",
  list_clause_requirements:  "viewer",

  // ── Group 2: Gap Analysis ────────────────────────────────
  // get_gap_summary → retired to iso27001://assessment/{id}/summary
  // Reads: viewer; writes: analyst; archive: analyst
  create_gap_assessment:       "analyst",
  update_control_status:       "analyst",
  list_gap_assessments:        "viewer",
  export_gap_report:           "viewer",
  generate_remediation_roadmap:"viewer",
  archive_gap_assessment:      "analyst",

  // ── Group 3: Risk Management ─────────────────────────────
  // get_risk → retired to iso27001://risk/{risk_id}
  // get_risk_summary → retired to iso27001://risks/summary
  // Reads: viewer; writes: analyst
  create_risk:            "analyst",
  update_risk:            "analyst",
  list_risks:             "viewer",
  create_treatment_plan:  "analyst",
  update_treatment_status:"analyst",
  generate_risk_register: "viewer",

  // ── Group 4: Policy Management ───────────────────────────
  // get_policy → retired to iso27001://policy/{policy_id}
  // Read: viewer; create: analyst; update (versioned): admin
  create_policy: "analyst",
  update_policy: "admin",
  list_policies: "viewer",

  // ── Group 5: Statement of Applicability ─────────────────
  // generate (DB write): analyst; update entries: analyst; export: viewer
  generate_soa:    "analyst",
  update_soa_entry:"analyst",
  export_soa:      "viewer",

  // ── Group 6: Audit Management ────────────────────────────
  // Read + report: viewer; all writes: admin
  create_audit:              "admin",
  record_finding:            "admin",
  create_corrective_action:  "admin",
  update_corrective_action:  "admin",
  generate_audit_report:     "viewer",

  // ── Group 7: Evidence Tracking ───────────────────────────
  // get_evidence_gaps → retired to iso27001://assessment/{id}/evidence-gaps
  // Read: viewer; register + link: analyst
  register_evidence:  "analyst",
  list_evidence:      "viewer",
  link_jira_ticket:   "analyst",
  link_github_issue:  "analyst",

  // ── Group 8: Server Info → retired to iso27001://server/info ─

  // ── Group 9: Admin & Key Management ─────────────────────
  query_audit_log: "admin",
  list_api_keys:   "admin",
  revoke_api_key:  "admin",

  // ── Group 10: Organization Profile ──────────────────────
  // get_organization_profile → retired to iso27001://org/profile
  set_organization_profile: "admin",

  // ── Group 11: Procedure Management ──────────────────────
  // get_procedure → retired to iso27001://procedure/{procedure_id}
  create_procedure: "analyst",
  update_procedure: "admin",
  list_procedures:  "viewer",
  export_procedure: "analyst",

  // ── Group 12: Management Review (Clause 9.3) ─────────────
  // get_management_review → retired to iso27001://management-review/{review_id}
  // Schedule/record: admin; read: viewer
  create_management_review:   "admin",
  record_review_input:        "admin",
  record_review_output:       "admin",
  complete_management_review: "admin",
  list_management_reviews:    "viewer",

  // ── Group 13: Improvement Plan (Clause 10.1) ─────────────
  // get_improvement_opportunity → retired to iso27001://improvement-plan/{opportunity_id}
  // Create/update: analyst; read: viewer
  create_improvement_opportunity: "analyst",
  update_improvement_opportunity: "analyst",
  list_improvement_opportunities: "viewer",

  // ── Group 14: Evidence Templates ──────────────────────────
  // get_evidence_document → retired to iso27001://evidence-document/{document_id}
  // Generate (writes two tables): analyst; read: viewer
  generate_evidence_document: "analyst",
  list_evidence_documents:    "viewer",

  // ── Group 15: CSV Import ─────────────────────────────────────
  import_risks:            "analyst",
  import_control_statuses: "analyst",
};

// ── Public API ────────────────────────────────────────────────

/**
 * Return true if the given role is permitted to call the tool.
 * Unknown tool names default to requiring admin (fail-safe).
 */
export function checkPermission(role: Role, toolName: string): boolean {
  const minRole = TOOL_MIN_ROLE[toolName] ?? "admin";
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
}

/**
 * Return the minimum role required for a tool.
 * Unknown tools require admin by default.
 */
export function minimumRole(toolName: string): Role {
  return TOOL_MIN_ROLE[toolName] ?? "admin";
}

/**
 * Assert that the role is permitted to call the tool.
 * Throws a structured RBAC_DENIED McpError if not.
 */
export function assertPermission(role: Role, toolName: string): void {
  if (!checkPermission(role, toolName)) {
    throw rbacDenied(toolName, minimumRole(toolName));
  }
}

/**
 * Return the full set of tool names a given role may call.
 * Useful for generating docs or test coverage lists.
 */
export function toolsForRole(role: Role): string[] {
  return Object.entries(TOOL_MIN_ROLE)
    .filter(([, minRole]) => ROLE_LEVEL[role] >= ROLE_LEVEL[minRole])
    .map(([toolName]) => toolName)
    .sort();
}

/** Total registered tool count — must equal 52 (13 read-only tools retired to MCP Resources). */
export const TOTAL_TOOLS = Object.keys(TOOL_MIN_ROLE).length;
