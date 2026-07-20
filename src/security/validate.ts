/**
 * iso27001-mcp — Zod input schemas (pure schema definitions)
 *
 * One named schema per tool. The tool-name → schema map (TOOL_SCHEMAS) is
 * derived from the unified registry in src/tools/registry.ts, which imports
 * these named schemas. The security pipeline runs schema.safeParse() on
 * every call, so .refine() cross-field rules are enforced at runtime.
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

// Coerce numeric inputs — Claude's MCP framework sometimes serialises
// integer parameters as JSON strings ("4" instead of 4).
// z.coerce.number() calls Number(input) before validation, so both
// the number 4 and the string "4" pass z.coerce.number().int().min(1).max(5).
const paginationLimit  = z.coerce.number().int().min(1).max(100).optional().default(50);
const paginationOffset = z.coerce.number().int().min(0).optional().default(0);

// Boolean coercion — MCP framework may also serialise booleans as strings.
// z.coerce.boolean() cannot be used because Boolean("false") === true.
// null is converted to undefined so .optional() short-circuits cleanly.
const coerceBool = z.preprocess(
  (v) => v == null ? undefined : v === "true" ? true : v === "false" ? false : v,
  z.boolean(),
);

// Title-case enum normalisation — Claude may send "technological" or
// "ORGANIZATIONAL" for values that the DB stores as "Technological".
// The preprocess finds the matching enum value case-insensitively.
function normEnum<T extends string>(vals: readonly T[]): z.ZodEffects<z.ZodEnum<[T, ...T[]]>, T, unknown> {
  return z.preprocess(
    (v: unknown) => {
      if (typeof v !== "string") return v;
      const lo = v.toLowerCase();
      return vals.find((o) => o.toLowerCase() === lo) ?? v;
    },
    z.enum(vals as unknown as [T, ...T[]]),
  );
}

// Reusable enums
const versionEnum      = z.enum(["2022", "2013"]);
const formatMarkdownCsvJson = z.enum(["markdown", "csv", "json"]);
const riskLevelEnum    = z.enum(["Low", "Medium", "High", "Critical"]);
const likelihood1to5   = z.coerce.number().int().min(1).max(5);
const roleEnum         = z.enum(["viewer", "analyst", "admin"]);
const outcomeEnum      = z.enum(["success", "denied", "error", "proposed"]);

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

// Case-insensitive versions so "technological" → "Technological", etc.
const normTheme           = normEnum(["Organizational", "People", "Physical", "Technological"] as const);
const normCybersecConcept = normEnum(["Identify", "Protect", "Detect", "Respond", "Recover"] as const);
const normControlType     = normEnum(["Preventive", "Detective", "Corrective"] as const);

// ── Group 1: Control Registry ────────────────────────────────
// GetControlSchema retired — use resource iso27001://control/{control_id}
// GetClauseRequirementSchema retired — use resource iso27001://clause/{clause_id}

export const ListControlsSchema = z.object({
  version:              versionEnum.optional(),
  theme:                z.string().max(100).optional(),
  control_type:         normControlType.optional(),
  new_in_2022:          coerceBool.optional(),
  cybersecurity_concept:normCybersecConcept.optional(),
  include_guidance:     coerceBool.optional().default(false),
  limit:                paginationLimit,
  offset:               paginationOffset,
});

export const SearchControlsSchema = z.object({
  query:   freeText(200),
  version: versionEnum.optional(),
  limit:   z.coerce.number().int().min(1).max(50).optional().default(10),
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

export const ListClauseRequirementsSchema = z.object({
  parent_id: z.string().max(10).optional(),
});

// ── Group 2: Gap Analysis ────────────────────────────────────

export const CreateGapAssessmentSchema = z.object({
  name:                 shortText(200),
  scope:                freeText(2000).optional(),
  isms_version:         versionEnum.optional().default("2022"),
  themes_in_scope:      z.array(normTheme).optional(),
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
  confirmed:       coerceBool.optional().default(false),
  proposal_id:     z.string().uuid().optional(),
});

// GetGapSummarySchema retired — use resource iso27001://assessment/{assessment_id}/summary

export const ListGapAssessmentsSchema = z.object({
  filter: z.enum(["active", "archived", "all"]).optional().default("active"),
});

export const ExportGapReportSchema = z.object({
  assessment_id: uuid,
  format:        formatMarkdownCsvJson,
});

export const GenerateRemediationRoadmapSchema = z.object({
  assessment_id:  uuid,
  timeline_weeks: z.coerce.number().int().min(1).max(52).optional().default(12),
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

// GetRiskSchema retired — use resource iso27001://risk/{risk_id}

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
  confirmed:        coerceBool.optional().default(false),
  proposal_id:      z.string().uuid().optional(),
});

export const ListRisksSchema = z.object({
  risk_level:  riskLevelEnum.optional(),
  status:      riskStatusEnum.optional(),
  owner:       shortText(200).optional(),
  limit:       paginationLimit,
  offset:      paginationOffset,
});

// GetRiskSummarySchema retired — use resource iso27001://risks/summary

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
  confirmed:           coerceBool.optional().default(false),
  proposal_id:         z.string().uuid().optional(),
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
  review_cycle_months:  z.coerce.number().int().min(1).max(36).optional().default(12),
  effective_date:       date,
  confirmed:            coerceBool.optional().default(false),
  proposal_id:          z.string().uuid().optional(),
});

// GetPolicySchema retired — use resource iso27001://policy/{policy_id}

export const UpdatePolicySchema = z.object({
  policy_id:      uuid,
  scope:          freeText(2000).optional(),
  owner:          shortText(200).optional(),
  approver:       shortText(200).optional(),
  reviewed_by:    shortText(200),
  change_summary: freeText(500),
  confirmed:      coerceBool.optional().default(false),
  proposal_id:    z.string().uuid().optional(),
});

export const ListPoliciesSchema = z.object({
  status:      policyStatusEnum.optional(),
  type:        policyTypeEnum.optional(),
  owner:       shortText(200).optional(),
  overdue_only:coerceBool.optional().default(false),
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
  included:          coerceBool,
  justification:     freeText(1000),
  status:            controlStatusEnum.optional(),
  responsible_party: shortText(200).optional(),
  confirmed:         coerceBool.optional().default(false),
  proposal_id:       z.string().uuid().optional(),
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
  confirmed:         coerceBool.optional().default(false),
  proposal_id:       z.string().uuid().optional(),
});

export const RecordFindingSchema = z.object({
  audit_id:           uuid,
  type:               findingTypeEnum,
  clause_or_control:  z.string().min(1).max(50),
  description:        freeText(2000),
  objective_evidence: freeText(2000),
  severity:           findingSeverityEnum.optional(),
  confirmed:          coerceBool.optional().default(false),
  proposal_id:        z.string().uuid().optional(),
});

export const CreateCorrectiveActionSchema = z.object({
  finding_id:  uuid,
  description: freeText(2000),
  owner:       shortText(200),
  due_date:    date,
  root_cause:  freeText(2000).optional(),
  confirmed:   coerceBool.optional().default(false),
  proposal_id: z.string().uuid().optional(),
});

export const UpdateCorrectiveActionSchema = z.object({
  car_id:                  uuid,
  description:             freeText(2000).optional(),
  owner:                   shortText(200).optional(),
  due_date:                date.optional(),
  status:                  carStatusEnum.optional(),
  root_cause:              freeText(2000).optional(),
  effectiveness_verified:  coerceBool.optional(),
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
  confirmed:      coerceBool.optional().default(false),
  proposal_id:    z.string().uuid().optional(),
});

export const ListEvidenceSchema = z.object({
  control_id: z.string().min(1).max(20),
  status:     z.enum(["current", "stale", "expired"]).optional(),
});

// GetEvidenceGapsSchema retired — use resource iso27001://assessment/{assessment_id}/evidence-gaps

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
  issue_number: z.coerce.number().int().positive().optional(),
  title:        shortText(200).optional(),
  body:         freeText(2000).optional(),
}).refine(
  (d) => d.issue_number !== undefined || d.title !== undefined,
  { message: "Provide either issue_number (to link) or title (to create)" },
);

// ── Group 8: Server Info retired to resource iso27001://server/info ──────────

// ── Group 9: Admin & Key Management ─────────────────────────

export const QueryAuditLogSchema = z.object({
  start_date:  date.optional(),
  end_date:    date.optional(),
  tool:        z.string().max(100).optional(),
  outcome:     outcomeEnum.optional(),
  role:        roleEnum.optional(),
  key_hash:    z.string().max(64).optional(),
  actor_type:  z.enum(["ai", "human", "system"]).optional(),
  limit:       paginationLimit,
  offset:      paginationOffset,
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
  review_cadence_months: z.coerce.number().int().min(1).max(36).optional().default(12),
  logo_url:           z.string().url().max(2000).optional(),
  primary_color:      z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be 6-digit hex e.g. #1e3a5f").optional(),
  document_footer:    z.string().max(500).optional(),
  certification_body: z.string().max(200).optional(),
});

// GetOrganizationProfileSchema retired — use resource iso27001://org/profile

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
  review_cycle_months:  z.coerce.number().int().min(1).max(36).optional().default(12),
  effective_date:       date,
});

// GetProcedureSchema retired — use resource iso27001://procedure/{procedure_id}

export const UpdateProcedureSchema = z.object({
  procedure_id:     uuid,
  scope:            freeText(2000).optional(),
  owner:            shortText(200).optional(),
  approver:         shortText(200).optional(),
  related_controls: z.array(z.string().max(20)).optional(),
  reviewed_by:      shortText(200),
  change_summary:   freeText(500),
  confirmed:        coerceBool.optional().default(false),
  proposal_id:      z.string().uuid().optional(),
});

export const ListProceduresSchema = z.object({
  procedure_type: procedureTypeEnum.optional(),
  status:         procedureStatusEnum.optional(),
  policy_id:      uuid.optional(),
  overdue_only:   coerceBool.optional().default(false),
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
  confirmed:    coerceBool.optional().default(false),
  proposal_id:  z.string().uuid().optional(),
});

// GetManagementReviewSchema retired — use resource iso27001://management-review/{review_id}

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

// GetImprovementOpportunitySchema retired — use resource iso27001://improvement-plan/{opportunity_id}

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

// GetEvidenceDocumentSchema retired — use resource iso27001://evidence-document/{document_id}

export const ListEvidenceDocumentsSchema = z.object({
  template_type: evidenceTemplateTypeEnum.optional(),
  generated_by:  shortText(200).optional(),
  control_id:    z.string().min(1).max(20).optional(),
  limit:         paginationLimit,
  offset:        paginationOffset,
});

// ── Group 15: CSV Import ─────────────────────────────────────

export const ImportRisksSchema = z.object({
  csv_content:    z.string().min(1).max(500_000).describe(
    "CSV string with headers: asset, threat, vulnerability, likelihood (1-5), impact (1-5), owner (optional), status (optional), related_controls (optional, semicolon-separated)",
  ),
  default_status: riskStatusEnum.optional().default("open"),
  dry_run:        coerceBool.optional().default(false),
});

export const ImportControlStatusesSchema = z.object({
  assessment_id: uuid,
  csv_content:   z.string().min(1).max(500_000).describe(
    "CSV string with headers: control_id, status (implemented|partial|not_implemented|na|not_started), notes (optional), na_justification (required when status=na)",
  ),
  dry_run:       coerceBool.optional().default(false),
});

// ── Registry ─────────────────────────────────────────────────
// The tool-name → schema map (TOOL_SCHEMAS) lives in the unified registry:
// import { TOOL_SCHEMAS } from "../tools/registry.js"
// (kept out of this file so validate.ts stays a pure, dependency-free
// schema module — it imports only zod).
