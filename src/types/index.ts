// ============================================================
// iso27001-mcp — Shared TypeScript Interfaces
// ============================================================

// ── Roles ────────────────────────────────────────────────────

export type Role = "viewer" | "analyst" | "admin";

export type Outcome = "success" | "denied" | "error";

// ── Control Registry ─────────────────────────────────────────

export type IsmsVersion = "2022" | "2013";
export type ControlTheme = "Organisational" | "People" | "Physical" | "Technological";
export type ControlType = "Preventive" | "Detective" | "Corrective";
export type CybersecurityConcept = "Identify" | "Protect" | "Detect" | "Respond" | "Recover";
export type MappingType = "direct" | "split" | "merged" | "renamed" | "new_2022" | "removed_2022";

export interface ControlAttributes {
  cybersecurity_concepts: CybersecurityConcept[];
  operational_capabilities: string[];
  security_domains: string[];
}

export interface Control {
  id: string;
  control_id: string;
  version: IsmsVersion;
  name: string;
  theme: string;
  description: string;
  guidance?: string;
  control_type: ControlType[];
  attributes?: ControlAttributes;     // 2022 only
  related_controls: string[];
  new_in_2022: boolean;               // 2022 only
  iso_clause_refs: string[];
  created_at: string;
}

export interface ControlVersionMapping {
  id: string;
  v2013_id: string | null;
  v2022_id: string | null;
  mapping_type: MappingType;
  change_summary: string;
  migration_notes?: string;
  created_at: string;
}

export interface ClauseRequirement {
  id: string;
  clause_id: string;
  parent_id?: string;
  title: string;
  requirement_text: string;
  implementation_notes?: string;
  related_controls: string[];
  created_at: string;
}

// ── Authentication ────────────────────────────────────────────

export interface ApiKey {
  id: string;
  key_hash: string;
  label: string;
  role: Role;
  created_at: string;
  expires_at?: string;
  revoked_at?: string;
  last_used_at?: string;
}

// ── Gap Analysis ─────────────────────────────────────────────

export type AssessmentStatus = "active" | "archived";
export type ControlImplStatus =
  | "implemented"
  | "partial"
  | "not_implemented"
  | "na"
  | "not_started";

export interface GapAssessment {
  id: string;
  name: string;
  scope?: string;
  isms_version: IsmsVersion;
  status: AssessmentStatus;
  themes_in_scope?: ControlTheme[];
  exclude_controls?: string[];
  exclude_justification?: string;
  archived_at?: string;
  archived_by?: string;
  archive_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ControlStatus {
  id: string;
  assessment_id: string;
  control_id: string;
  status: ControlImplStatus;
  evidence_refs?: string[];
  notes?: string;
  assessed_by?: string;
  na_justification?: string;
  assessed_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Risk Management ──────────────────────────────────────────

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type RiskStatus = "open" | "accepted" | "mitigated" | "transferred" | "closed";
export type TreatmentType = "mitigate" | "accept" | "avoid" | "transfer";
export type TreatmentStatus =
  | "planned"
  | "in_progress"
  | "implemented"
  | "verified"
  | "cancelled";

export interface Risk {
  id: string;
  asset: string;
  threat: string;
  vulnerability: string;
  likelihood: number;
  impact: number;
  risk_score: number;       // computed: likelihood * impact
  risk_level: RiskLevel;    // computed: derived from risk_score
  owner?: string;
  status: RiskStatus;
  related_controls?: string[];
  created_at: string;
  updated_at: string;
}

export interface RiskTreatment {
  id: string;
  risk_id: string;
  treatment_type: TreatmentType;
  description: string;
  owner: string;
  due_date: string;
  controls?: string[];
  status: TreatmentStatus;
  residual_likelihood?: number;
  residual_impact?: number;
  residual_risk_score?: number;   // computed
  residual_risk_level?: RiskLevel; // computed
  evidence_ref?: string;
  created_at: string;
  updated_at: string;
}

// ── Policy Management ────────────────────────────────────────

export type PolicyType =
  | "information_security_policy"
  | "access_control_policy"
  | "risk_assessment_policy"
  | "incident_response_policy"
  | "asset_management_policy"
  | "supplier_security_policy"
  | "business_continuity_policy"
  | "cryptography_policy"
  | "clear_desk_policy"
  | "acceptable_use_policy"
  | "hr_security_policy";

export type PolicyStatus = "draft" | "active" | "archived";

export interface Policy {
  id: string;
  type: PolicyType;
  organisation_name: string;
  scope: string;
  owner: string;
  approver?: string;
  status: PolicyStatus;
  version: number;
  content: string;
  clause_mappings?: string[];
  control_mappings?: string[];
  review_cycle_months: number;
  effective_date: string;
  next_review_date: string;
  reviewed_by?: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersion {
  id: string;
  policy_id: string;
  version: number;
  content: string;
  change_summary?: string;
  reviewed_by?: string;
  approved_by?: string;
  archived_at: string;
}

// ── Statement of Applicability ───────────────────────────────

export interface Soa {
  id: string;
  assessment_id: string;
  isms_version: IsmsVersion;
  created_at: string;
  updated_at: string;
}

export interface SoaEntry {
  id: string;
  soa_id: string;
  control_id: string;
  included: boolean;
  justification: string;
  status?: ControlImplStatus;
  evidence_count: number;
  responsible_party?: string;
  created_at: string;
  updated_at: string;
}

// ── Audit Management ─────────────────────────────────────────

export type AuditStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type FindingType = "nc" | "obs" | "ofi";
export type FindingSeverity = "major" | "minor";
export type CarStatus = "open" | "in_progress" | "implemented" | "verified" | "closed";

export interface Audit {
  id: string;
  name: string;
  scope: string;
  auditor: string;
  planned_date: string;
  actual_date?: string;
  status: AuditStatus;
  controls_in_scope?: string[];
  clauses_in_scope?: string[];
  created_at: string;
  updated_at: string;
}

export interface Finding {
  id: string;
  audit_id: string;
  type: FindingType;
  clause_or_control: string;
  description: string;
  objective_evidence: string;
  severity?: FindingSeverity;
  created_at: string;
  updated_at: string;
}

export interface CorrectiveAction {
  id: string;
  finding_id: string;
  description: string;
  owner: string;
  due_date: string;
  status: CarStatus;
  root_cause?: string;
  effectiveness_verified: boolean;
  evidence_ref?: string;
  created_at: string;
  updated_at: string;
}

// ── Evidence Tracking ────────────────────────────────────────

export type EvidenceType =
  | "policy"
  | "procedure"
  | "log"
  | "screenshot"
  | "report"
  | "certificate"
  | "configuration"
  | "meeting_minutes"
  | "training_record"
  | "contract"
  | "audit_report"
  | "test_result"
  | "ticket"
  | "other";

export type EvidenceStatus = "current" | "stale" | "expired";

export interface Evidence {
  id: string;
  control_id: string;
  type: EvidenceType;
  description: string;
  source_url?: string;
  collected_by: string;
  collected_date: string;
  expiry_date?: string;
  jira_key?: string;
  jira_url?: string;
  github_issue_url?: string;
  github_issue_number?: number;
  created_at: string;
  updated_at: string;
  // Computed at query time — not stored in DB
  status?: EvidenceStatus;
}

// ── Audit Logging ────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  timestamp: string;
  tool: string;
  key_hash: string;
  role: Role;
  params_json: string;
  outcome: Outcome;
  error_message?: string;
  duration_ms: number;
  row_hash: string;
}

// ── MCP Error ────────────────────────────────────────────────

export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "RBAC_DENIED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "INTEGRATION_ERROR"
  | "DB_ERROR"
  | "INTERNAL_ERROR";

export interface McpErrorPayload {
  error_code: ErrorCode;
  message: string;
  field?: string;
  hint?: string;
  docs_ref?: string;
}

// ── Server Info ──────────────────────────────────────────────

export interface ServerInfo {
  version: string;
  commit_sha?: string;
  build_timestamp?: string;
  mcp_protocol_version: string;
  control_data: {
    version_2022_count: number;
    checksum_2022?: string;
    checksum_2013?: string;
  };
  database: {
    path: string;
    size_bytes?: number;
    encrypted: boolean;
    assessment_count: number;
    risk_count: number;
    policy_count: number;
    audit_count: number;
    evidence_count: number;
  };
  uptime_seconds: number;
  mode: string;
}
