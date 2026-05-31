/**
 * iso27001-mcp — Zod input schemas for all 63 tools
 *
 * One named schema per tool. Used in the 11-step pipeline (step 7: Zod parse)
 * before sanitisation and business logic run.
 *
 * Convention:
 *   - UUIDs: z.string().uuid()
 *   - Dates: z.string().regex(DATE_RE, "must be YYYY-MM-DD")
 *   - Free text: z.string().max(N) — N matches LENGTH_CAPS in sanitise.ts
 *   - Enums: z.enum([...]) — exhaustive
 *   - Optional fields: .optional() or .optional().default(value)
 */

import { z } from "zod";

// ── Shared primitives ─────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date    = z.string().regex(DATE_RE, "must be YYYY-MM-DD");
const uuid    = z.string().uuid("must be a valid UUID");
const freeText = (max = 2000): z.ZodString => z.string().min(1).max(max);
const shortText = (max = 200): z.ZodString => z.string().min(1).max(max);

const paginationLimit  = z.number().int().min(1).max(100).optional().default(50);
const paginationOffset = z.number().int().min(0).optional().default(0);

// Reusable enums
const versionEnum      = z.enum(["2022", "2013"]);
const formatMarkdownCsvJson = z.enum(["markdown", "csv", "json"]);
const riskLevelEnum    = z.enum(["Low", "Medium", "High", "Critical"]);
const likelihood1to5   = z.number().int().min(1).max(5);
const roleEnum         = z.enum(["viewer", "analyst", "admin"]);
const outcomeEnum      = z.enum(["success", "denied", "error"]);

const controlStatusEnum = z.enum([
  "implemented", "partial", "not_implemented", "na", "not_started",
]);

const riskStatusEnum = z.enum([
  "open", "accepted", "mitigated", "transferred", "closed",
]);

const treatmentTypeEnum = z.enum([
  "mitigate", "accept", "avoid", "transfer",
]);

const treatmentStatusEnum = z.enum([
  "planned", "in_progress", "implemented", "verified", "cancelled",
]);

const policyTypeEnum = z.enum([
  "information_security",
  "access_control",
  "risk_management",
  "asset_management",
  "incident_response",
  "business_continuity",
  "supplier_security",
  "cryptography",
  "physical_security",
  "acceptable_use",
  "data_classification",
  "secure_development",
]);

const policyStatusEnum = z.enum(["draft", "active", "archived"]);

const findingTypeEnum   = z.enum(["nc", "obs", "ofi"]);
const findingSeverityEnum = z.enum(["major", "minor"]);

const evidenceTypeEnum = z.enum([
  "policy", "procedure", "log", "screenshot", "report", "certificate",
  "configuration", "meeting_minutes", "training_record", "contract",
  "audit_report", "test_result", "ticket", "other",
]);

const carStatusEnum = z.enum([
  "open", "in_progress", "implemented", "verified", "closed",
]);

const themeEnum = z.enum([
  "Organizational", "People", "Physical", "Technological",
]);

const cybersecurityConceptEnum = z.enum([
  "Identify", "Protect", "Detect", "Respond", "Recover",
]);

// ── Group 1: Control Registry ────────────────────────────────

export const GetControlSchema = z.object({
  control_id: z.string().min(1).max(20),
  version:    versionEnum.optional(),
});

export const ListControlsSchema = z.object({
  version:              versionEnum.optional(),
  theme:                z.string().max(100).optional(),
  control_type:         z.enum(["Preventive", "Detective", "Corrective"]).optional(),
  new_in_2022:          z.boolean().optional(),
  cybersecurity_concept:cybersecurityConceptEnum.optional(),
  include_guidance:     z.boolean().optional().default(false),
  limit:                paginationLimit,
  offset:               paginationOffset,
});

export const SearchControlsSchema = z.object({
  query:   freeText(200),
  version: versionEnum.optional(),
  limit:   z.number().int().min(1).max(50).optional().default(10),
  offset:  paginationOffset,
});

export const GetControlAttributesSchema = z.object({
  control_id: z.string().min(1).max(20),
});

export const CompareVersionsSchema = z.object({
  v2013_id: z.string().min(1).max(20).optional(),
  v2022_id: z.string().min(1).max(20).optional(),
}).refine(
  (d) => d.v2013_id !== undefined || d.v2022_id !== undefined,
  { message: "At least one of v2013_id or v2022_id must be provided" },
);

export const GetClauseRequirementSchema = z.object({
  clause_id:           z.string().min(1).max(10),
  include_sub_clauses: z.boolean().optional().default(false),
});

export const ListClauseRequirementsSchema = z.object({
  parent_id: z.string().max(10).optional(),
});

// ── Group 2: Gap Analysis ────────────────────────────────────

export const CreateGapAssessmentSchema = z.object({
  name:                 shortText(200),
  scope:                freeText(2000).optional(),
  isms_version:         versionEnum.optional().default("2022"),
  themes_in_scope:      z.array(themeEnum).optional(),
  exclude_controls:     z.array(z.string().max(20)).optional(),
  exclude_justification:freeText(1000).optional(),
});

export const UpdateControlStatusSchema = z.object({
  assessment_id:   uuid,
  control_id:      z.string().min(1).max(20),
  status:          controlStatusEnum,
  evidence_refs:   z.array(uuid).optional(),
  notes:           freeText(2000).optional(),
  na_justification:freeText(1000).optional(),
  assessed_by:     shortText(200).optional(),
});

export const GetGapSummarySchema = z.object({
  assessment_id: uuid,
  breakdown_by:  z.enum(["theme", "control_type", "cybersecurity_concept"]).optional(),
});

export const ListGapAssessmentsSchema = z.object({
  filter: z.enum(["active", "archived", "all"]).optional().default("active"),
});

export const ExportGapReportSchema = z.object({
  assessment_id: uuid,
  format:        formatMarkdownCsvJson,
});

export const GenerateRemediationRoadmapSchema = z.object({
  assessment_id:  uuid,
  timeline_weeks: z.number().int().min(1).max(52).optional().default(12),
});

export const ArchiveGapAssessmentSchema = z.object({
  assessment_id: uuid,
  reason:        freeText(1000).optional(),
});

// ── Group 3: Risk Management ─────────────────────────────────

export const CreateRiskSchema = z.object({
  asset:            shortText(200),
  threat:           shortText(200),
  vulnerability:    freeText(2000),
  likelihood:       likelihood1to5,
  impact:           likelihood1to5,
  owner:            shortText(200).optional(),
  related_controls: z.array(z.string().max(20)).optional(),
  status:           riskStatusEnum.optional().default("open"),
});

export const GetRiskSchema = z.object({
  risk_id:            uuid,
  include_treatments: z.boolean().optional().default(false),
});

export const UpdateRiskSchema = z.object({
  risk_id:          uuid,
  asset:            shortText(200).optional(),
  threat:           shortText(200).optional(),
  vulnerability:    freeText(2000).optional(),
  likelihood:       likelihood1to5.optional(),
  impact:           likelihood1to5.optional(),
  owner:            shortText(200).optional(),
  status:           riskStatusEnum.optional(),
  related_controls: z.array(z.string().max(20)).optional(),
});

export const ListRisksSchema = z.object({
  risk_level:  riskLevelEnum.optional(),
  status:      riskStatusEnum.optional(),
  owner:       shortText(200).optional(),
  limit:       paginationLimit,
  offset:      paginationOffset,
});

export const GetRiskSummarySchema = z.object({});

export const CreateTreatmentPlanSchema = z.object({
  risk_id:             uuid,
  treatment_type:      treatmentTypeEnum,
  description:         freeText(2000),
  owner:               shortText(200),
  due_date:            date,
  controls:            z.array(z.string().max(20)).optional(),
  residual_likelihood: likelihood1to5.optional(),
  residual_impact:     likelihood1to5.optional(),
  evidence_ref:        shortText(200).optional(),
});

export const UpdateTreatmentStatusSchema = z.object({
  treatment_id:        uuid,
  status:              treatmentStatusEnum,
  evidence_ref:        shortText(200).optional(),
  residual_likelihood: likelihood1to5.optional(),
  residual_impact:     likelihood1to5.optional(),
});

export const GenerateRiskRegisterSchema = z.object({
  format:            formatMarkdownCsvJson,
  risk_level_filter: riskLevelEnum.optional(),
  status_filter:     riskStatusEnum.optional(),
});

// ── Group 4: Policy Management ───────────────────────────────

export const CreatePolicySchema = z.object({
  type:                 policyTypeEnum,
  organisation_name:    shortText(200).optional(),   // falls back to org profile if omitted
  scope:                freeText(2000).optional(),    // falls back to org profile if omitted
  owner:                shortText(200),
  approver:             shortText(200).optional(),
  review_cycle_months:  z.number().int().min(1).max(36).optional().default(12),
  effective_date:       date,
});

export const GetPolicySchema = z.object({
  policy_id:        uuid,
  include_versions: z.boolean().optional().default(false),
});

export const UpdatePolicySchema = z.object({
  policy_id:      uuid,
  scope:          freeText(2000).optional(),
  owner:          shortText(200).optional(),
  approver:       shortText(200).optional(),
  reviewed_by:    shortText(200),
  change_summary: freeText(500),
});

export const ListPoliciesSchema = z.object({
  status:      policyStatusEnum.optional(),
  type:        policyTypeEnum.optional(),
  owner:       shortText(200).optional(),
  overdue_only:z.boolean().optional().default(false),
  limit:       paginationLimit,
  offset:      paginationOffset,
});

// ── Group 5: Statement of Applicability ─────────────────────

export const GenerateSoaSchema = z.object({
  assessment_id: uuid,
  isms_version:  versionEnum.optional().default("2022"),
});

export const UpdateSoaEntrySchema = z.object({
  soa_id:            uuid,
  control_id:        z.string().min(1).max(20),
  included:          z.boolean(),
  justification:     freeText(1000),
  status:            controlStatusEnum.optional(),
  responsible_party: shortText(200).optional(),
});

export const ExportSoaSchema = z.object({
  soa_id: uuid,
  format: z.enum(["markdown", "csv", "html"]),
});

// ── Group 6: Audit Management ────────────────────────────────

export const CreateAuditSchema = z.object({
  name:              shortText(200),
  scope:             freeText(2000),
  auditor:           shortText(200),
  planned_date:      date,
  controls_in_scope: z.array(z.string().max(20)).optional(),
  clauses_in_scope:  z.array(z.string().max(10)).optional(),
});

export const RecordFindingSchema = z.object({
  audit_id:           uuid,
  type:               findingTypeEnum,
  clause_or_control:  z.string().min(1).max(50),
  description:        freeText(2000),
  objective_evidence: freeText(2000),
  severity:           findingSeverityEnum.optional(),
});

export const CreateCorrectiveActionSchema = z.object({
  finding_id:  uuid,
  description: freeText(2000),
  owner:       shortText(200),
  due_date:    date,
  root_cause:  freeText(2000).optional(),
});

export const UpdateCorrectiveActionSchema = z.object({
  car_id:                  uuid,
  description:             freeText(2000).optional(),
  owner:                   shortText(200).optional(),
  due_date:                date.optional(),
  status:                  carStatusEnum.optional(),
  root_cause:              freeText(2000).optional(),
  effectiveness_verified:  z.boolean().optional(),
  evidence_ref:            shortText(200).optional(),
});

export const GenerateAuditReportSchema = z.object({
  audit_id: uuid,
  format:   z.enum(["markdown", "json", "html"]),
});

// ── Group 7: Evidence Tracking ───────────────────────────────

export const RegisterEvidenceSchema = z.object({
  control_id:     z.string().min(1).max(20),
  type:           evidenceTypeEnum,
  description:    freeText(2000),
  source_url:     z.string().url().max(500).optional(),
  collected_by:   shortText(200),
  collected_date: date,
  expiry_date:    date.optional(),
});

export const ListEvidenceSchema = z.object({
  control_id: z.string().min(1).max(20),
  status:     z.enum(["current", "stale", "expired"]).optional(),
});

export const GetEvidenceGapsSchema = z.object({
  assessment_id: uuid,
});

export const LinkJiraTicketSchema = z.object({
  evidence_id: uuid,
  jira_key:    z.string().regex(/^[A-Z]+-\d+$/, "must be a Jira key like ISMS-123").optional(),
  summary:     shortText(200).optional(),
  description: freeText(2000).optional(),
}).refine(
  (d) => d.jira_key !== undefined || d.summary !== undefined,
  { message: "Provide either jira_key (to link) or summary (to create)" },
);

export const LinkGithubIssueSchema = z.object({
  evidence_id:  uuid,
  issue_number: z.number().int().positive().optional(),
  title:        shortText(200).optional(),
  body:         freeText(2000).optional(),
}).refine(
  (d) => d.issue_number !== undefined || d.title !== undefined,
  { message: "Provide either issue_number (to link) or title (to create)" },
);

// ── Group 8: Server Info ─────────────────────────────────────

export const GetServerInfoSchema = z.object({});

// ── Group 9: Admin & Key Management ─────────────────────────

export const QueryAuditLogSchema = z.object({
  start_date: date.optional(),
  end_date:   date.optional(),
  tool:       z.string().max(100).optional(),
  outcome:    outcomeEnum.optional(),
  role:       roleEnum.optional(),
  key_hash:   z.string().max(64).optional(),
  limit:      paginationLimit,
  offset:     paginationOffset,
});

export const ListApiKeysSchema = z.object({});

export const RevokeApiKeySchema = z.object({
  label: shortText(200),
});

// ── Group 10: Organization Profile ───────────────────────────

export const SetOrganizationProfileSchema = z.object({
  legal_entity_name:       shortText(200),
  registered_jurisdiction: shortText(200),
  regulatory_licences:     z.array(shortText(200)).optional(),
  in_scope_activities:     freeText(2000),
  isms_scope_statement:    freeText(2000),
  declared_exclusions:     freeText(2000).optional(),
  raci_roles: z.object({
    ciso:              shortText(200).optional(),
    dpo:               shortText(200).optional(),
    data_owner:        shortText(200).optional(),
    isms_manager:      shortText(200).optional(),
    internal_auditor:  shortText(200).optional(),
  }).optional(),
  review_cadence_months: z.number().int().min(1).max(36).optional().default(12),
  logo_url:           z.string().url().max(2000).optional(),
  primary_color:      z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be 6-digit hex e.g. #1e3a5f").optional(),
  document_footer:    z.string().max(500).optional(),
  certification_body: z.string().max(200).optional(),
});

export const GetOrganizationProfileSchema = z.object({});

// ── Group 11: Procedure Management ───────────────────────────

const procedureTypeEnum = z.enum([
  "access_provisioning",
  "incident_handling",
  "change_management",
  "backup_restore",
  "vulnerability_management",
  "supplier_onboarding",
  "cryptographic_key_management",
  "data_classification_handling",
  "secure_development_workflow",
  "bcp_testing",
  "asset_onboarding_offboarding",
  "audit_log_review",
]);

const procedureStatusEnum = z.enum(["draft", "active", "archived"]);

export const CreateProcedureSchema = z.object({
  type:                 procedureTypeEnum,
  organisation_name:    shortText(200).optional(),   // falls back to org profile
  scope:                freeText(2000).optional(),    // falls back to org profile
  owner:                shortText(200),
  approver:             shortText(200).optional(),
  policy_id:            uuid.optional(),
  related_controls:     z.array(z.string().max(20)).optional(),
  review_cycle_months:  z.number().int().min(1).max(36).optional().default(12),
  effective_date:       date,
});

export const GetProcedureSchema = z.object({
  procedure_id:     uuid,
  include_versions: z.boolean().optional().default(false),
});

export const UpdateProcedureSchema = z.object({
  procedure_id:     uuid,
  scope:            freeText(2000).optional(),
  owner:            shortText(200).optional(),
  approver:         shortText(200).optional(),
  related_controls: z.array(z.string().max(20)).optional(),
  reviewed_by:      shortText(200),
  change_summary:   freeText(500),
});

export const ListProceduresSchema = z.object({
  procedure_type: procedureTypeEnum.optional(),
  status:         procedureStatusEnum.optional(),
  policy_id:      uuid.optional(),
  overdue_only:   z.boolean().optional().default(false),
  limit:          paginationLimit,
  offset:         paginationOffset,
});

export const ExportProcedureSchema = z.object({
  procedure_id: uuid,
  format:       z.enum(["markdown", "json", "html"]),
});

// ── Group 12: Management Review (Clause 9.3) ─────────────────

const reviewStatusEnum = z.enum(["planned", "in_progress", "completed"]);

const reviewInputCategoryEnum = z.enum([
  "previous_action_status",
  "external_internal_issues",
  "interested_party_needs",
  "isms_performance",
  "interested_party_feedback",
  "risk_assessment_results",
  "improvement_opportunities",
]);

const reviewOutputTypeEnum = z.enum([
  "improvement_decision",
  "isms_change_decision",
]);

const reviewTrendEnum = z.enum([
  "improving", "stable", "declining", "insufficient_data",
]);

export const CreateManagementReviewSchema = z.object({
  title:        shortText(200),
  review_date:  date,
  reviewers:    z.array(shortText(200)).min(1, "At least one reviewer required"),
  scope_notes:  freeText(2000).optional(),
});

export const RecordReviewInputSchema = z.object({
  review_id:      uuid,
  input_category: reviewInputCategoryEnum,
  summary:        freeText(2000),
  details:        freeText(4000).optional(),
  trend:          reviewTrendEnum.optional(),
});

export const RecordReviewOutputSchema = z.object({
  review_id:   uuid,
  output_type: reviewOutputTypeEnum,
  decision:    freeText(2000),
  owner:       shortText(200).optional(),
  due_date:    date.optional(),
});

export const CompleteManagementReviewSchema = z.object({
  review_id:    uuid,
  completed_by: shortText(200),
});

export const GetManagementReviewSchema = z.object({
  review_id: uuid,
});

export const ListManagementReviewsSchema = z.object({
  status: reviewStatusEnum.optional(),
  limit:  paginationLimit,
  offset: paginationOffset,
});

// ── Group 13: Improvement Plan (Clause 10.1) ─────────────────

const improvementStatusEnum = z.enum([
  "open", "in_progress", "implemented", "closed",
]);

const improvementSourceEnum = z.enum([
  "management_review", "risk_assessment", "audit", "monitoring", "other",
]);

const improvementPriorityEnum = z.enum([
  "low", "medium", "high", "critical",
]);

export const CreateImprovementOpportunitySchema = z.object({
  title:       shortText(200),
  description: freeText(2000),
  source:      improvementSourceEnum,
  priority:    improvementPriorityEnum.optional().default("medium"),
  owner:       shortText(200).optional(),
  target_date: date.optional(),
  review_id:   uuid.optional(),
});

export const UpdateImprovementOpportunitySchema = z.object({
  opportunity_id: uuid,
  status:         improvementStatusEnum.optional(),
  owner:          shortText(200).optional(),
  target_date:    date.optional(),
  priority:       improvementPriorityEnum.optional(),
  description:    freeText(2000).optional(),
});

export const GetImprovementOpportunitySchema = z.object({
  opportunity_id: uuid,
});

export const ListImprovementOpportunitiesSchema = z.object({
  status:    improvementStatusEnum.optional(),
  source:    improvementSourceEnum.optional(),
  priority:  improvementPriorityEnum.optional(),
  review_id: uuid.optional(),
  limit:     paginationLimit,
  offset:    paginationOffset,
});

// ── Group 14: Evidence Templates ─────────────────────────────

const evidenceTemplateTypeEnum = z.enum([
  "access_review_attestation",
  "training_acknowledgement",
  "supplier_security_questionnaire",
  "incident_post_mortem",
  "bcp_test_report",
  "risk_treatment_sign_off",
]);

export const GenerateEvidenceDocumentSchema = z.object({
  template_type:     evidenceTemplateTypeEnum,
  title:             shortText(200),
  generated_by:      shortText(200),
  organisation_name: shortText(200).optional(),   // falls back to org profile
  control_id:        z.string().min(1).max(20).optional(),
  vars:              z.record(z.string()).optional().default({}),
});

export const GetEvidenceDocumentSchema = z.object({
  document_id: uuid,
});

export const ListEvidenceDocumentsSchema = z.object({
  template_type: evidenceTemplateTypeEnum.optional(),
  generated_by:  shortText(200).optional(),
  control_id:    z.string().min(1).max(20).optional(),
  limit:         paginationLimit,
  offset:        paginationOffset,
});

// ── Registry: tool name → schema ─────────────────────────────

export const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // Group 1
  get_control:               GetControlSchema,
  list_controls:             ListControlsSchema,
  search_controls:           SearchControlsSchema,
  get_control_attributes:    GetControlAttributesSchema,
  compare_versions:          CompareVersionsSchema,
  get_clause_requirement:    GetClauseRequirementSchema,
  list_clause_requirements:  ListClauseRequirementsSchema,
  // Group 2
  create_gap_assessment:        CreateGapAssessmentSchema,
  update_control_status:        UpdateControlStatusSchema,
  get_gap_summary:              GetGapSummarySchema,
  list_gap_assessments:         ListGapAssessmentsSchema,
  export_gap_report:            ExportGapReportSchema,
  generate_remediation_roadmap: GenerateRemediationRoadmapSchema,
  archive_gap_assessment:       ArchiveGapAssessmentSchema,
  // Group 3
  create_risk:            CreateRiskSchema,
  get_risk:               GetRiskSchema,
  update_risk:            UpdateRiskSchema,
  list_risks:             ListRisksSchema,
  get_risk_summary:       GetRiskSummarySchema,
  create_treatment_plan:  CreateTreatmentPlanSchema,
  update_treatment_status:UpdateTreatmentStatusSchema,
  generate_risk_register: GenerateRiskRegisterSchema,
  // Group 4
  create_policy: CreatePolicySchema,
  get_policy:    GetPolicySchema,
  update_policy: UpdatePolicySchema,
  list_policies: ListPoliciesSchema,
  // Group 5
  generate_soa:    GenerateSoaSchema,
  update_soa_entry:UpdateSoaEntrySchema,
  export_soa:      ExportSoaSchema,
  // Group 6
  create_audit:             CreateAuditSchema,
  record_finding:           RecordFindingSchema,
  create_corrective_action: CreateCorrectiveActionSchema,
  update_corrective_action: UpdateCorrectiveActionSchema,
  generate_audit_report:    GenerateAuditReportSchema,
  // Group 7
  register_evidence: RegisterEvidenceSchema,
  list_evidence:     ListEvidenceSchema,
  get_evidence_gaps: GetEvidenceGapsSchema,
  link_jira_ticket:  LinkJiraTicketSchema,
  link_github_issue: LinkGithubIssueSchema,
  // Group 8
  get_server_info: GetServerInfoSchema,
  // Group 9
  query_audit_log: QueryAuditLogSchema,
  list_api_keys:   ListApiKeysSchema,
  revoke_api_key:  RevokeApiKeySchema,
  // Group 10
  set_organization_profile: SetOrganizationProfileSchema,
  get_organization_profile: GetOrganizationProfileSchema,
  // Group 11
  create_procedure: CreateProcedureSchema,
  get_procedure:    GetProcedureSchema,
  update_procedure: UpdateProcedureSchema,
  list_procedures:  ListProceduresSchema,
  export_procedure: ExportProcedureSchema,
  // Group 12
  create_management_review:  CreateManagementReviewSchema,
  record_review_input:       RecordReviewInputSchema,
  record_review_output:      RecordReviewOutputSchema,
  complete_management_review:CompleteManagementReviewSchema,
  get_management_review:     GetManagementReviewSchema,
  list_management_reviews:   ListManagementReviewsSchema,
  // Group 13
  create_improvement_opportunity: CreateImprovementOpportunitySchema,
  update_improvement_opportunity: UpdateImprovementOpportunitySchema,
  get_improvement_opportunity:    GetImprovementOpportunitySchema,
  list_improvement_opportunities: ListImprovementOpportunitiesSchema,
  // Group 14
  generate_evidence_document: GenerateEvidenceDocumentSchema,
  get_evidence_document:      GetEvidenceDocumentSchema,
  list_evidence_documents:    ListEvidenceDocumentsSchema,
};

// ── validateToolInput ─────────────────────────────────────────

/**
 * Parse and validate tool input against the tool's Zod schema.
 * Returns the parsed (coerced, defaulted) value on success.
 * Throws McpError(VALIDATION_ERROR) on the first failing field.
 */
import { validationError } from "../types/errors.js";

export function validateToolInput<T>(toolName: string, raw: unknown): T {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    throw validationError("toolName", `No schema registered for tool '${toolName}'`);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join(".") || "input";
    throw validationError(field, firstIssue.message);
  }

  return result.data as T;
}
