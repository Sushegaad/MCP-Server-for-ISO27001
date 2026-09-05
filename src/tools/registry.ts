/**
 * iso27001-mcp — Unified tool registry
 *
 * THE single source of truth for every tool: name, description, minimum
 * role, Zod schema, and handler. All other views (TOOL_MIN_ROLE,
 * TOOL_SCHEMAS, TOOL_DESCRIPTIONS, TOOL_HANDLERS) are derived from this
 * array — drift between them is impossible by construction, and a tool
 * missing any part is a TypeScript compile error, not a runtime WARNING.
 *
 * Adding a tool = adding ONE entry here (plus the schema in
 * src/security/validate.ts and the handler in a src/tools/ domain file).
 */

import type { z } from "zod";
import type { ToolResult } from "../types/result.js";

// ── Schemas ───────────────────────────────────────────────────
import {
  ListControlsSchema, SearchControlsSchema, GetControlAttributesSchema,
  CompareVersionsSchema, ListClauseRequirementsSchema,
  CreateGapAssessmentSchema, UpdateControlStatusSchema, ListGapAssessmentsSchema,
  ExportGapReportSchema, GenerateRemediationRoadmapSchema, ArchiveGapAssessmentSchema,
  CreateRiskSchema, UpdateRiskSchema, ListRisksSchema,
  CreateTreatmentPlanSchema, UpdateTreatmentStatusSchema, GenerateRiskRegisterSchema,
  CreatePolicySchema, UpdatePolicySchema, ListPoliciesSchema,
  GenerateSoaSchema, UpdateSoaEntrySchema, ExportSoaSchema,
  CreateAuditSchema, RecordFindingSchema, CreateCorrectiveActionSchema,
  UpdateCorrectiveActionSchema, GenerateAuditReportSchema,
  RegisterEvidenceSchema, ListEvidenceSchema, LinkJiraTicketSchema, LinkGithubIssueSchema,
  QueryAuditLogSchema, ListApiKeysSchema, RevokeApiKeySchema,
  SetOrganizationProfileSchema,
  CreateProcedureSchema, UpdateProcedureSchema, ListProceduresSchema, ExportProcedureSchema,
  CreateManagementReviewSchema, RecordReviewInputSchema, RecordReviewOutputSchema,
  CompleteManagementReviewSchema, ListManagementReviewsSchema,
  CreateImprovementOpportunitySchema, UpdateImprovementOpportunitySchema,
  ListImprovementOpportunitiesSchema,
  GenerateEvidenceDocumentSchema, ListEvidenceDocumentsSchema,
  ImportRisksSchema, ImportControlStatusesSchema,
  VerifyEvidenceSchema,
  SetRiskMethodologySchema, RecordRiskAcceptanceSchema, ListRiskAcceptancesSchema,
} from "../security/validate.js";

// ── Handlers ──────────────────────────────────────────────────
import {
  handleListControls, handleSearchControls,
  handleGetControlAttributes, handleCompareVersions,
  handleListClauseRequirements,
} from "./controls.js";
import {
  handleCreateGapAssessment, handleUpdateControlStatus,
  handleListGapAssessments, handleExportGapReport,
  handleGenerateRemediationRoadmap, handleArchiveGapAssessment,
} from "./gap-analysis.js";
import {
  handleCreateRisk, handleUpdateRisk, handleListRisks,
  handleCreateTreatmentPlan,
  handleUpdateTreatmentStatus, handleGenerateRiskRegister,
} from "./risks.js";
import {
  handleCreatePolicy, handleUpdatePolicy, handleListPolicies,
} from "./policies.js";
import {
  handleGenerateSoa, handleUpdateSoaEntry, handleExportSoa,
} from "./soa.js";
import {
  handleCreateAudit, handleRecordFinding, handleCreateCorrectiveAction,
  handleUpdateCorrectiveAction, handleGenerateAuditReport,
} from "./audit-management.js";
import {
  handleRegisterEvidence, handleListEvidence,
  handleLinkJiraTicket, handleLinkGithubIssue,
  handleVerifyEvidence,
} from "./evidence-tracking.js";
import {
  handleQueryAuditLog, handleListApiKeys, handleRevokeApiKey,
} from "./admin.js";
import {
  handleSetOrganizationProfile,
} from "./org-profile.js";
import {
  handleCreateProcedure, handleUpdateProcedure,
  handleListProcedures, handleExportProcedure,
} from "./procedures.js";
import {
  handleCreateManagementReview, handleRecordReviewInput, handleRecordReviewOutput,
  handleCompleteManagementReview, handleListManagementReviews,
} from "./management-review.js";
import {
  handleCreateImprovementOpportunity, handleUpdateImprovementOpportunity,
  handleListImprovementOpportunities,
} from "./improvement-plan.js";
import {
  handleGenerateEvidenceDocument,
  handleListEvidenceDocuments,
} from "./evidence-templates.js";
import { handleImportRisks, handleImportControlStatuses } from "./csv-import.js";
import {
  handleSetRiskMethodology, handleRecordRiskAcceptance,
  handleListRiskAcceptances,
} from "./governance.js";

// ── Types ─────────────────────────────────────────────────────

export type Role = "viewer" | "analyst" | "admin";

/**
 * MCP tool annotations (behaviour hints per the MCP spec).
 * Machine-readable metadata clients can use to scope, batch, or
 * confirm tool use. Hints only — the security pipeline (RBAC, HITL
 * confirmation gates, audit log) remains the enforcement layer.
 */
export interface ToolAnnotations {
  readOnlyHint?:    boolean;
  destructiveHint?: boolean;
  idempotentHint?:  boolean;
}

export interface ToolDefinition {
  name:        string;
  description: string;
  minRole:     Role;
  schema:      z.ZodTypeAny;
  handler:     (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
  annotations?: ToolAnnotations;
  /**
   * HITL confirmation gate policy. `true` means the tool follows the
   * preview/confirm protocol (buildPreviewResponse / consumeProposal in
   * src/tools/hitl-utils.ts): its schema carries `confirmed` + `proposal_id`,
   * an unconfirmed call must write nothing, and a confirmed call must consume
   * a valid proposal token. The pipeline (src/tools/index.ts) verifies after
   * every confirmed call that the gate actually executed.
   */
  hitl?: boolean;
}

// ── Annotation presets ────────────────────────────────────────
// Every registry entry carries one of these four shapes:
//   READ_ONLY   — pure lookups/exports; no DB writes, safe to repeat
//   MUTATING    — creates or updates ISMS records (non-destructive)
//   UPSERT      — idempotent write: same args ⇒ same end state
//   DESTRUCTIVE — removes a record from active use (archive/revoke)

const READ_ONLY:   ToolAnnotations = { readOnlyHint: true };
const MUTATING:    ToolAnnotations = { readOnlyHint: false, destructiveHint: false };
const UPSERT:      ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };

// ── The registry ──────────────────────────────────────────────
// 13 read-only lookup tools have been retired to MCP Resources
// (iso27001:// URIs via registerAllResources) and do not appear here.

export const TOOLS: readonly ToolDefinition[] = [

  // ── Group 1: Control Registry (read-only, viewer+) ────────
  // get_control → retired to resource iso27001://control/{control_id}
  // get_clause_requirement → retired to resource iso27001://clause/{clause_id}
  {
    name:        "list_controls",
    description: "List ISO 27001 controls with optional filters: version, theme, control_type, new_in_2022, cybersecurity_concept, and pagination.",
    minRole:     "viewer",
    schema:      ListControlsSchema,
    handler:     handleListControls,
    annotations: READ_ONLY,
  },
  {
    name:        "search_controls",
    description: "Full-text search across control names, descriptions, and guidance using the FTS5 index.",
    minRole:     "viewer",
    schema:      SearchControlsSchema,
    handler:     handleSearchControls,
    annotations: READ_ONLY,
  },
  {
    name:        "get_control_attributes",
    description: "Retrieve the 2022 attribute tags for a control: information_security_properties, cybersecurity_concepts, operational_capabilities, security_domains.",
    minRole:     "viewer",
    schema:      GetControlAttributesSchema,
    handler:     handleGetControlAttributes,
    annotations: READ_ONLY,
  },
  {
    name:        "compare_versions",
    description: "Show the mapping relationship between a 2013 control and its 2022 equivalent(s), or vice versa.",
    minRole:     "viewer",
    schema:      CompareVersionsSchema,
    handler:     handleCompareVersions,
    annotations: READ_ONLY,
  },
  {
    name:        "list_clause_requirements",
    description: "List ISO 27001:2022 clause requirements (clauses 4–10), optionally filtered by parent clause.",
    minRole:     "viewer",
    schema:      ListClauseRequirementsSchema,
    handler:     handleListClauseRequirements,
    annotations: READ_ONLY,
  },

  // ── Group 2: Gap Analysis (reads: viewer+, writes: analyst+) ──
  // get_gap_summary → retired to resource iso27001://assessment/{assessment_id}/summary
  {
    name:        "create_gap_assessment",
    description: "Create a new gap assessment against ISO 27001:2022 or 2013 controls for a defined ISMS scope.",
    minRole:     "analyst",
    schema:      CreateGapAssessmentSchema,
    handler:     handleCreateGapAssessment,
    annotations: MUTATING,
  },
  {
    name:        "update_control_status",
    description: "Set the implementation status of a control within a gap assessment (implemented, partial, not_implemented, na, not_started). Omit confirmed or pass confirmed=false to preview changes without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      UpdateControlStatusSchema,
    handler:     handleUpdateControlStatus,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_gap_assessments",
    description: "List gap assessments filtered by status (active, archived, all).",
    minRole:     "viewer",
    schema:      ListGapAssessmentsSchema,
    handler:     handleListGapAssessments,
    annotations: READ_ONLY,
  },
  {
    name:        "export_gap_report",
    description: "Export a full gap assessment report in markdown, CSV, or JSON format.",
    minRole:     "viewer",
    schema:      ExportGapReportSchema,
    handler:     handleExportGapReport,
    annotations: READ_ONLY,
  },
  {
    name:        "generate_remediation_roadmap",
    description: "Generate a prioritised remediation roadmap from a gap assessment, grouped by risk level and theme.",
    minRole:     "viewer",
    schema:      GenerateRemediationRoadmapSchema,
    handler:     handleGenerateRemediationRoadmap,
    annotations: READ_ONLY,
  },
  {
    name:        "archive_gap_assessment",
    description: "Archive a completed or superseded gap assessment with an optional reason. Omit confirmed or pass confirmed=false to preview without writing; pass confirmed=true to commit (archiving is irreversible via tools).",
    minRole:     "analyst",
    schema:      ArchiveGapAssessmentSchema,
    handler:     handleArchiveGapAssessment,
    annotations: DESTRUCTIVE,
    hitl:        true,
  },

  // ── Group 3: Risk Management (reads: viewer+, writes: analyst+) ──
  // get_risk → retired to resource iso27001://risk/{risk_id}
  // get_risk_summary → retired to resource iso27001://risks/summary
  {
    name:        "create_risk",
    description: "Register a new information security risk with asset, threat, vulnerability, likelihood (1–5), and impact (1–5).",
    minRole:     "analyst",
    schema:      CreateRiskSchema,
    handler:     handleCreateRisk,
    annotations: MUTATING,
  },
  {
    name:        "update_risk",
    description: "Update mutable fields of an existing risk (asset, threat, vulnerability, likelihood, impact, owner, status, related_controls). Omit confirmed or pass confirmed=false to preview a field-level diff without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      UpdateRiskSchema,
    handler:     handleUpdateRisk,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_risks",
    description: "List risks with optional filters: risk_level, status, owner, and pagination.",
    minRole:     "viewer",
    schema:      ListRisksSchema,
    handler:     handleListRisks,
    annotations: READ_ONLY,
  },
  {
    name:        "create_treatment_plan",
    description: "Create a risk treatment plan (mitigate, accept, avoid, or transfer) with owner, due date, and optionally residual risk scores.",
    minRole:     "analyst",
    schema:      CreateTreatmentPlanSchema,
    handler:     handleCreateTreatmentPlan,
    annotations: MUTATING,
  },
  {
    name:        "update_treatment_status",
    description: "Update the status and evidence reference for an existing risk treatment plan. Omit confirmed or pass confirmed=false to preview changes without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      UpdateTreatmentStatusSchema,
    handler:     handleUpdateTreatmentStatus,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "generate_risk_register",
    description: "Export the full risk register in markdown, CSV, or JSON format with optional level/status filters.",
    minRole:     "viewer",
    schema:      GenerateRiskRegisterSchema,
    handler:     handleGenerateRiskRegister,
    annotations: READ_ONLY,
  },

  // ── Group 4: Policy Management (reads: viewer+, create: analyst+, update: admin) ──
  // get_policy → retired to resource iso27001://policy/{policy_id}
  {
    name:        "create_policy",
    description: "Generate a new ISMS policy document from a Mustache template using organisation_name, scope, owner, and effective_date. Omit confirmed or pass confirmed=false to preview what will be created without writing; pass confirmed=true to generate and save the policy.",
    minRole:     "analyst",
    schema:      CreatePolicySchema,
    handler:     handleCreatePolicy,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "update_policy",
    description: "Create a new version of an existing policy with scope/owner changes, reviewed_by, and change_summary. Requires admin role. Omit confirmed or pass confirmed=false to preview the version bump and metadata diff without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      UpdatePolicySchema,
    handler:     handleUpdatePolicy,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_policies",
    description: "List policies with optional filters: status, type, owner, overdue_only, and pagination.",
    minRole:     "viewer",
    schema:      ListPoliciesSchema,
    handler:     handleListPolicies,
    annotations: READ_ONLY,
  },

  // ── Group 5: Statement of Applicability (analyst+) ────────
  {
    name:        "generate_soa",
    description: "Generate a Statement of Applicability from a gap assessment, pre-populating inclusion/exclusion for all controls.",
    minRole:     "analyst",
    schema:      GenerateSoaSchema,
    handler:     handleGenerateSoa,
    annotations: MUTATING,
  },
  {
    name:        "update_soa_entry",
    description: "Update an SoA entry's inclusion status, justification, implementation status, and responsible party. Omit confirmed or pass confirmed=false to preview changes without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      UpdateSoaEntrySchema,
    handler:     handleUpdateSoaEntry,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "export_soa",
    description: "Export the Statement of Applicability in markdown or CSV format.",
    minRole:     "viewer",
    schema:      ExportSoaSchema,
    handler:     handleExportSoa,
    annotations: READ_ONLY,
  },

  // ── Group 6: Audit Management (reads: viewer+, writes: admin) ──
  {
    name:        "create_audit",
    description: "Create an internal ISMS audit record with auditor, planned date, and controls/clauses in scope. Omit confirmed or pass confirmed=false to preview the audit record without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      CreateAuditSchema,
    handler:     handleCreateAudit,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "record_finding",
    description: "Record an audit finding (NC, observation, or OFI) against a clause or control. Omit confirmed or pass confirmed=false to preview the finding without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      RecordFindingSchema,
    handler:     handleRecordFinding,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "create_corrective_action",
    description: "Create a corrective action request (CAR) linked to an audit finding with owner and due date. Omit confirmed or pass confirmed=false to preview the CAR without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      CreateCorrectiveActionSchema,
    handler:     handleCreateCorrectiveAction,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "update_corrective_action",
    description: "Update a corrective action's status, root cause, evidence reference, or effectiveness verification.",
    minRole:     "admin",
    schema:      UpdateCorrectiveActionSchema,
    handler:     handleUpdateCorrectiveAction,
    annotations: MUTATING,
  },
  {
    name:        "generate_audit_report",
    description: "Export an audit report including findings and CAR status in markdown or JSON format.",
    minRole:     "viewer",
    schema:      GenerateAuditReportSchema,
    handler:     handleGenerateAuditReport,
    annotations: READ_ONLY,
  },

  // ── Group 7: Evidence Tracking (reads: viewer+, writes: analyst+) ──
  // get_evidence_gaps → retired to resource iso27001://assessment/{assessment_id}/evidence-gaps
  {
    name:        "register_evidence",
    description: "Register an evidence artefact linked to a control with type, source URL, collector, and optional expiry date. Omit confirmed or pass confirmed=false to preview the evidence record without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      RegisterEvidenceSchema,
    handler:     handleRegisterEvidence,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_evidence",
    description: "List evidence records for a control, optionally filtered by status (current, stale, expired).",
    minRole:     "viewer",
    schema:      ListEvidenceSchema,
    handler:     handleListEvidence,
    annotations: READ_ONLY,
  },
  {
    name:        "verify_evidence",
    description: "Record an independent verification of an evidence artefact: reviewer (must differ from the collector), verification_status (verified | rejected), sufficiency (required when verified), and an optional assertion. Omit confirmed or pass confirmed=false to preview without writing; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      VerifyEvidenceSchema,
    handler:     handleVerifyEvidence,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "link_jira_ticket",
    description: "Link an evidence record to an existing Jira ticket by key, or create a new ticket from a summary.",
    minRole:     "analyst",
    schema:      LinkJiraTicketSchema,
    handler:     handleLinkJiraTicket,
    annotations: MUTATING,
  },
  {
    name:        "link_github_issue",
    description: "Link an evidence record to an existing GitHub issue by number, or create a new issue from a title and body.",
    minRole:     "analyst",
    schema:      LinkGithubIssueSchema,
    handler:     handleLinkGithubIssue,
    annotations: MUTATING,
  },

  // ── Group 8: Server Info → retired to resource iso27001://server/info ──

  // ── Group 9: Admin & Key Management (admin only) ──────────
  {
    name:        "query_audit_log",
    description: "Query the tamper-evident audit log with optional filters: date range, tool, outcome, role, key_hash, actor_type (ai | human | system).",
    minRole:     "admin",
    schema:      QueryAuditLogSchema,
    handler:     handleQueryAuditLog,
    annotations: READ_ONLY,
  },
  {
    name:        "list_api_keys",
    description: "List all API keys with their metadata (label, role, status, expiry). Never returns key hashes.",
    minRole:     "admin",
    schema:      ListApiKeysSchema,
    handler:     handleListApiKeys,
    annotations: READ_ONLY,
  },
  {
    name:        "revoke_api_key",
    description: "Revoke an API key by label, preventing all future use and evicting its live SSE sessions. Omit confirmed or pass confirmed=false to preview without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      RevokeApiKeySchema,
    handler:     handleRevokeApiKey,
    annotations: DESTRUCTIVE,
    hitl:        true,
  },

  // ── Group 10: Organization Profile (admin) ────────────────
  // get_organization_profile → retired to resource iso27001://org/profile
  {
    name:        "set_organization_profile",
    description: "Upsert the singleton organization profile (legal name, jurisdiction, ISMS scope, RACI roles). Used by create_policy and create_procedure to auto-inject org defaults.",
    minRole:     "admin",
    schema:      SetOrganizationProfileSchema,
    handler:     handleSetOrganizationProfile,
    annotations: UPSERT,
  },

  // ── Group 11: Procedure Management (reads: viewer+, create: analyst+, update: admin) ──
  // get_procedure → retired to resource iso27001://procedure/{procedure_id}
  {
    name:        "create_procedure",
    description: "Generate a new ISMS procedure document from a Mustache template. Optionally links to a parent policy. Falls back to org profile for organisation_name and scope if not supplied.",
    minRole:     "analyst",
    schema:      CreateProcedureSchema,
    handler:     handleCreateProcedure,
    annotations: MUTATING,
  },
  {
    name:        "update_procedure",
    description: "Archive the current procedure version and re-render with updated fields, incrementing the version number. Requires admin role. Omit confirmed or pass confirmed=false to preview the version bump and metadata diff without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      UpdateProcedureSchema,
    handler:     handleUpdateProcedure,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_procedures",
    description: "List procedures with optional filters: procedure_type, status, policy_id, overdue_only, and pagination.",
    minRole:     "viewer",
    schema:      ListProceduresSchema,
    handler:     handleListProcedures,
    annotations: READ_ONLY,
  },
  {
    name:        "export_procedure",
    description: "Export a procedure as a markdown document (with related controls appended) or as structured JSON.",
    minRole:     "analyst",
    schema:      ExportProcedureSchema,
    handler:     handleExportProcedure,
    annotations: READ_ONLY,
  },

  // ── Group 12: Management Review, Clause 9.3 (reads: viewer+, writes: admin) ──
  // get_management_review → retired to resource iso27001://management-review/{review_id}
  {
    name:        "create_management_review",
    description: "Schedule a new management review (ISO 27001:2022 Clause 9.3) with title, date, and reviewers list.",
    minRole:     "admin",
    schema:      CreateManagementReviewSchema,
    handler:     handleCreateManagementReview,
    annotations: MUTATING,
  },
  {
    name:        "record_review_input",
    description: "Record one of the 7 mandatory Clause 9.3.2 input categories for a management review. Upserts on re-submission; advances status to in_progress on first input.",
    minRole:     "admin",
    schema:      RecordReviewInputSchema,
    handler:     handleRecordReviewInput,
    annotations: UPSERT,
  },
  {
    name:        "record_review_output",
    description: "Record a Clause 9.3.3 output decision (improvement_decision or isms_change_decision) for a management review.",
    minRole:     "admin",
    schema:      RecordReviewOutputSchema,
    handler:     handleRecordReviewOutput,
    annotations: MUTATING,
  },
  {
    name:        "complete_management_review",
    description: "Mark a management review as completed. Enforces ISO 27001:2022 §9.3.2: all 7 input categories must be recorded, and at least one output must be present. Omit confirmed or pass confirmed=false to preview review readiness (inputs recorded vs. missing, output count) without writing; pass confirmed=true to finalise.",
    minRole:     "admin",
    schema:      CompleteManagementReviewSchema,
    handler:     handleCompleteManagementReview,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_management_reviews",
    description: "List management reviews with optional status filter and pagination.",
    minRole:     "viewer",
    schema:      ListManagementReviewsSchema,
    handler:     handleListManagementReviews,
    annotations: READ_ONLY,
  },

  // ── Group 13: Improvement Plan, Clause 10.1 (reads: viewer+, writes: analyst+) ──
  // get_improvement_opportunity → retired to resource iso27001://improvement-plan/{opportunity_id}
  {
    name:        "create_improvement_opportunity",
    description: "Register a proactive improvement opportunity (ISO 27001:2022 Clause 10.1) with source, priority, owner, and optional target date. Not linked to a nonconformity.",
    minRole:     "analyst",
    schema:      CreateImprovementOpportunitySchema,
    handler:     handleCreateImprovementOpportunity,
    annotations: MUTATING,
  },
  {
    name:        "update_improvement_opportunity",
    description: "Advance an improvement opportunity's status (forward-only: open → in_progress → implemented → closed) or update owner, target date, priority, or description.",
    minRole:     "analyst",
    schema:      UpdateImprovementOpportunitySchema,
    handler:     handleUpdateImprovementOpportunity,
    annotations: MUTATING,
  },
  {
    name:        "list_improvement_opportunities",
    description: "List improvement opportunities with optional filters (status, source, priority, review_id) and a backlog health rating (excellent/good/fair/needs_attention/at_risk).",
    minRole:     "viewer",
    schema:      ListImprovementOpportunitiesSchema,
    handler:     handleListImprovementOpportunities,
    annotations: READ_ONLY,
  },

  // ── Group 14: Evidence Templates (reads: viewer+, generate: analyst+) ──
  // get_evidence_document → retired to resource iso27001://evidence-document/{document_id}
  {
    name:        "generate_evidence_document",
    description: "Render one of 6 Mustache evidence templates (access_review_attestation, training_acknowledgement, supplier_security_questionnaire, incident_post_mortem, bcp_test_report, risk_treatment_sign_off) with org-profile auto-injection. Returns rendered Markdown and simultaneously registers an evidence record.",
    minRole:     "analyst",
    schema:      GenerateEvidenceDocumentSchema,
    handler:     handleGenerateEvidenceDocument,
    annotations: MUTATING,
  },
  {
    name:        "list_evidence_documents",
    description: "List generated evidence documents with optional filters: template_type, generated_by, control_id, and pagination.",
    minRole:     "viewer",
    schema:      ListEvidenceDocumentsSchema,
    handler:     handleListEvidenceDocuments,
    annotations: READ_ONLY,
  },

  // ── Group 15: CSV Import (analyst+) ───────────────────────
  {
    name:        "import_risks",
    description: "Bulk-import risks from a CSV string. Supports dry_run=true for validation preview. Omit confirmed or pass confirmed=false to preview the import without writing; pass confirmed=true to commit. Headers: asset, threat, vulnerability, likelihood (1–5), impact (1–5), owner, status, related_controls (semicolon-separated).",
    minRole:     "analyst",
    schema:      ImportRisksSchema,
    handler:     handleImportRisks,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "import_control_statuses",
    description: "Bulk-update control implementation statuses in a gap assessment from a CSV string. Supports dry_run=true for validation preview. Omit confirmed or pass confirmed=false to preview the import without writing; pass confirmed=true to commit. Headers: control_id, status, notes, na_justification.",
    minRole:     "analyst",
    schema:      ImportControlStatusesSchema,
    handler:     handleImportControlStatuses,
    annotations: MUTATING,
    hitl:        true,
  },

  // ── Group 16: Risk Governance, §6.1.3 (reads: viewer+, acceptance: analyst+, methodology: admin) ──
  {
    name:        "set_risk_methodology",
    description: "Upsert the organisation's singleton risk methodology: likelihood/impact scales, calculation method, risk level bands, acceptance threshold, escalation rules, and review frequency. Omit confirmed or pass confirmed=false to preview the diff against the current methodology without writing; pass confirmed=true to commit.",
    minRole:     "admin",
    schema:      SetRiskMethodologySchema,
    handler:     handleSetRiskMethodology,
    annotations: UPSERT,
    hitl:        true,
  },
  {
    name:        "record_risk_acceptance",
    description: "Record a risk owner's decision to accept or reject residual risk (ISO 27001:2022 §6.1.3), freezing inherent/residual scores and the acceptance threshold at decision time. Requires residual scores on the treatment plan when one is referenced; accepting an above-threshold residual demands a substantive rationale. Omit confirmed or pass confirmed=false to preview; pass confirmed=true to commit.",
    minRole:     "analyst",
    schema:      RecordRiskAcceptanceSchema,
    handler:     handleRecordRiskAcceptance,
    annotations: MUTATING,
    hitl:        true,
  },
  {
    name:        "list_risk_acceptances",
    description: "List recorded risk acceptance decisions with optional filters (risk_id, decision) and pagination.",
    minRole:     "viewer",
    schema:      ListRiskAcceptancesSchema,
    handler:     handleListRiskAcceptances,
    annotations: READ_ONLY,
  },
];

// ── Derived views ─────────────────────────────────────────────
// Preserve the exact shapes existing consumers expect. These are the ONLY
// exports other modules should read — never re-declare these maps by hand.

export const TOOL_MIN_ROLE: Record<string, Role> =
  Object.fromEntries(TOOLS.map((t): [string, Role] => [t.name, t.minRole]));

export const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> =
  Object.fromEntries(TOOLS.map((t): [string, z.ZodTypeAny] => [t.name, t.schema]));

export const TOOL_DESCRIPTIONS: Record<string, string> =
  Object.fromEntries(TOOLS.map((t): [string, string] => [t.name, t.description]));

export const TOOL_HANDLERS: Record<string, ToolDefinition["handler"]> =
  Object.fromEntries(TOOLS.map((t): [string, ToolDefinition["handler"]] => [t.name, t.handler]));
