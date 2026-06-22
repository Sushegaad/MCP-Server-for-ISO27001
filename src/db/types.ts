/**
 * iso27001-mcp — Shared database row interfaces
 *
 * Single source of truth for all DB row types used across both
 * src/tools/ and src/resources/. Import from here rather than
 * declaring per-file duplicates.
 */

// ── Group 3: Risk Management ──────────────────────────────────

export interface RiskRow {
  id:               string;
  asset:            string;
  threat:           string;
  vulnerability:    string;
  likelihood:       number;
  impact:           number;
  risk_score:       number;
  risk_level:       string;
  owner:            string | null;
  status:           string;
  related_controls: string | null;
  created_at:       string;
  updated_at:       string;
}

export interface TreatmentRow {
  id:                   string;
  risk_id:              string;
  treatment_type:       string;
  description:          string;
  owner:                string;
  due_date:             string;
  controls:             string | null;
  status:               string;
  residual_likelihood:  number | null;
  residual_impact:      number | null;
  residual_risk_score:  number | null;
  residual_risk_level:  string | null;
  evidence_ref:         string | null;
  created_at:           string;
  updated_at:           string;
}

// ── Group 2: Gap Analysis ─────────────────────────────────────

export interface AssessmentRow {
  id:                    string;
  name:                  string;
  scope:                 string | null;
  isms_version:          string;
  status:                string;
  themes_in_scope:       string | null;
  exclude_controls:      string | null;
  exclude_justification: string | null;
  archived_at:           string | null;
  archived_by:           string | null;
  archive_reason:        string | null;
  created_at:            string;
  updated_at:            string;
}

// ── Group 6: Audit Management ─────────────────────────────────

export interface AuditRow {
  id:                string;
  name:              string;
  scope:             string;
  auditor:           string;
  planned_date:      string;
  actual_date:       string | null;
  status:            string;
  controls_in_scope: string | null;
  clauses_in_scope:  string | null;
  created_at:        string;
  updated_at:        string;
}

export interface FindingRow {
  id:                 string;
  audit_id:           string;
  type:               string;
  clause_or_control:  string;
  description:        string;
  objective_evidence: string;
  severity:           string | null;
  created_at:         string;
  updated_at:         string;
}

export interface CorrectiveActionRow {
  id:                     string;
  finding_id:             string;
  description:            string;
  owner:                  string;
  due_date:               string;
  status:                 string;
  root_cause:             string | null;
  effectiveness_verified: number;  // 0|1
  evidence_ref:           string | null;
  created_at:             string;
  updated_at:             string;
}

// ── Group 4: Policy Management ────────────────────────────────

export interface PolicyRow {
  id:                  string;
  type:                string;
  organisation_name:   string;
  scope:               string;
  owner:               string;
  approver:            string | null;
  status:              string;
  version:             number;
  content:             string;
  clause_mappings:     string | null;
  control_mappings:    string | null;
  review_cycle_months: number;
  effective_date:      string;
  next_review_date:    string;
  reviewed_by:         string | null;
  approved_by:         string | null;
  created_at:          string;
  updated_at:          string;
}

export interface PolicyVersionRow {
  id:             string;
  policy_id:      string;
  version:        number;
  content:        string;
  change_summary: string | null;
  reviewed_by:    string | null;
  approved_by:    string | null;
  archived_at:    string;
}

// ── Group 11: Procedure Management ───────────────────────────

export interface ProcedureRow {
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

export interface ProcedureVersionRow {
  id:             string;
  procedure_id:   string;
  version:        number;
  content:        string;
  change_summary: string | null;
  reviewed_by:    string | null;
  archived_at:    string;
}

// ── Group 13: Improvement Plan ────────────────────────────────

export interface OpportunityRow {
  id:          string;
  title:       string;
  description: string;
  source:      string;
  priority:    string;
  owner:       string | null;
  target_date: string | null;
  status:      string;
  review_id:   string | null;
  created_at:  string;
  updated_at:  string;
}
