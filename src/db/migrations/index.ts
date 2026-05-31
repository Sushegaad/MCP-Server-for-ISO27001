// ============================================================
// iso27001-mcp — Migration Definitions
// SQL is embedded here so tsup can bundle the server as a single
// self-contained CJS file. The .sql files in this directory are
// the canonical source — keep them in sync with the strings below.
// ============================================================

export interface Migration {
  filename: string;
  sql: string;
}

const MIGRATION_0001 = `-- ============================================================
-- iso27001-mcp  Migration 0001 — Full Initial Schema
-- Applied once by the migration runner on first startup.
-- !! Never edit this file after it has been applied !!
-- !! Create a new migration for any schema change       !!
-- ============================================================

-- ── Control Registry ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS controls (
  id               TEXT PRIMARY KEY NOT NULL,
  control_id       TEXT NOT NULL,
  version          TEXT NOT NULL CHECK (version IN ('2022','2013')),
  name             TEXT NOT NULL,
  theme            TEXT NOT NULL,
  description      TEXT NOT NULL,
  guidance         TEXT,
  control_type     TEXT NOT NULL,  -- JSON array: ["Preventive","Detective"]
  attributes       TEXT,           -- JSON object (2022 only)
  related_controls TEXT,           -- JSON array of control IDs
  new_in_2022      INTEGER NOT NULL DEFAULT 0,  -- boolean 0|1
  iso_clause_refs  TEXT,           -- JSON array of clause IDs
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(control_id, version)
);

CREATE TABLE IF NOT EXISTS control_version_mapping (
  id              TEXT PRIMARY KEY NOT NULL,
  v2013_id        TEXT,
  v2022_id        TEXT,
  mapping_type    TEXT NOT NULL CHECK (mapping_type IN (
                    'direct','split','merged','renamed','new_2022','removed_2022'
                  )),
  change_summary  TEXT NOT NULL,
  migration_notes TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Clause Requirements ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS clause_requirements (
  id                   TEXT PRIMARY KEY NOT NULL,
  clause_id            TEXT NOT NULL UNIQUE,
  parent_id            TEXT REFERENCES clause_requirements(id),
  title                TEXT NOT NULL,
  requirement_text     TEXT NOT NULL,
  implementation_notes TEXT,
  related_controls     TEXT,  -- JSON array of control IDs
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── API Keys ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('viewer','analyst','admin')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT,
  revoked_at   TEXT,
  last_used_at TEXT
);

-- ── Gap Assessments ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gap_assessments (
  id                    TEXT PRIMARY KEY NOT NULL,
  name                  TEXT NOT NULL,
  scope                 TEXT,
  isms_version          TEXT NOT NULL DEFAULT '2022' CHECK (isms_version IN ('2022','2013')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  themes_in_scope       TEXT,   -- JSON array or NULL (all themes)
  exclude_controls      TEXT,   -- JSON array
  exclude_justification TEXT,
  archived_at           TEXT,
  archived_by           TEXT,
  archive_reason        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS control_statuses (
  id               TEXT PRIMARY KEY NOT NULL,
  assessment_id    TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  control_id       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
                     'implemented','partial','not_implemented','na','not_started'
                   )),
  evidence_refs    TEXT,   -- JSON array of evidence UUIDs
  notes            TEXT,
  assessed_by      TEXT,
  na_justification TEXT,
  assessed_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assessment_id, control_id)
);

-- ── Risk Management ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risks (
  id               TEXT PRIMARY KEY NOT NULL,
  asset            TEXT NOT NULL,
  threat           TEXT NOT NULL,
  vulnerability    TEXT NOT NULL,
  likelihood       INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact           INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_score       INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  risk_level       TEXT GENERATED ALWAYS AS (
                     CASE
                       WHEN likelihood * impact BETWEEN 1  AND 4  THEN 'Low'
                       WHEN likelihood * impact BETWEEN 5  AND 9  THEN 'Medium'
                       WHEN likelihood * impact BETWEEN 10 AND 16 THEN 'High'
                       ELSE 'Critical'
                     END
                   ) STORED,
  owner            TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                     'open','accepted','mitigated','transferred','closed'
                   )),
  related_controls TEXT,  -- JSON array of control IDs
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS risk_treatments (
  id                  TEXT PRIMARY KEY NOT NULL,
  risk_id             TEXT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  treatment_type      TEXT NOT NULL CHECK (treatment_type IN (
                        'mitigate','accept','avoid','transfer'
                      )),
  description         TEXT NOT NULL,
  owner               TEXT NOT NULL,
  due_date            TEXT NOT NULL,
  controls            TEXT,   -- JSON array (required for mitigate type)
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                        'planned','in_progress','implemented','verified','cancelled'
                      )),
  residual_likelihood INTEGER CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact     INTEGER CHECK (residual_impact BETWEEN 1 AND 5),
  residual_risk_score INTEGER GENERATED ALWAYS AS (
                        CASE
                          WHEN residual_likelihood IS NOT NULL
                           AND residual_impact     IS NOT NULL
                          THEN residual_likelihood * residual_impact
                          ELSE NULL
                        END
                      ) STORED,
  residual_risk_level TEXT GENERATED ALWAYS AS (
                        CASE
                          WHEN residual_likelihood IS NULL OR residual_impact IS NULL THEN NULL
                          WHEN residual_likelihood * residual_impact BETWEEN 1  AND 4  THEN 'Low'
                          WHEN residual_likelihood * residual_impact BETWEEN 5  AND 9  THEN 'Medium'
                          WHEN residual_likelihood * residual_impact BETWEEN 10 AND 16 THEN 'High'
                          ELSE 'Critical'
                        END
                      ) STORED,
  evidence_ref        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Policy Management ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policies (
  id                  TEXT PRIMARY KEY NOT NULL,
  type                TEXT NOT NULL,
  organisation_name   TEXT NOT NULL,
  scope               TEXT NOT NULL,
  owner               TEXT NOT NULL,
  approver            TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  version             INTEGER NOT NULL DEFAULT 1,
  content             TEXT NOT NULL,
  clause_mappings     TEXT,  -- JSON array
  control_mappings    TEXT,  -- JSON array
  review_cycle_months INTEGER NOT NULL DEFAULT 12,
  effective_date      TEXT NOT NULL,
  next_review_date    TEXT NOT NULL,
  reviewed_by         TEXT,
  approved_by         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id             TEXT PRIMARY KEY NOT NULL,
  policy_id      TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  content        TEXT NOT NULL,
  change_summary TEXT,
  reviewed_by    TEXT,
  approved_by    TEXT,
  archived_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(policy_id, version)
);

-- ── Statement of Applicability ───────────────────────────────

CREATE TABLE IF NOT EXISTS soa (
  id            TEXT PRIMARY KEY NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  isms_version  TEXT NOT NULL DEFAULT '2022',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soa_entries (
  id                TEXT PRIMARY KEY NOT NULL,
  soa_id            TEXT NOT NULL REFERENCES soa(id) ON DELETE CASCADE,
  control_id        TEXT NOT NULL,
  included          INTEGER NOT NULL DEFAULT 1,  -- boolean 0|1
  justification     TEXT NOT NULL,
  status            TEXT,
  evidence_count    INTEGER NOT NULL DEFAULT 0,
  responsible_party TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(soa_id, control_id)
);

-- ── Audit Management ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audits (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  scope             TEXT NOT NULL,
  auditor           TEXT NOT NULL,
  planned_date      TEXT NOT NULL,
  actual_date       TEXT,
  status            TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                      'planned','in_progress','completed','cancelled'
                    )),
  controls_in_scope TEXT,  -- JSON array
  clauses_in_scope  TEXT,  -- JSON array
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
  id                 TEXT PRIMARY KEY NOT NULL,
  audit_id           TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('nc','obs','ofi')),
  clause_or_control  TEXT NOT NULL,
  description        TEXT NOT NULL,
  objective_evidence TEXT NOT NULL,
  severity           TEXT CHECK (severity IN ('major','minor')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id                     TEXT PRIMARY KEY NOT NULL,
  finding_id             TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  description            TEXT NOT NULL,
  owner                  TEXT NOT NULL,
  due_date               TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                           'open','in_progress','implemented','verified','closed'
                         )),
  root_cause             TEXT,
  effectiveness_verified INTEGER NOT NULL DEFAULT 0,  -- boolean 0|1
  evidence_ref           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Evidence Tracking ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence (
  id                   TEXT PRIMARY KEY NOT NULL,
  control_id           TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN (
                         'policy','procedure','log','screenshot','report','certificate',
                         'configuration','meeting_minutes','training_record','contract',
                         'audit_report','test_result','ticket','other'
                       )),
  description          TEXT NOT NULL,
  source_url           TEXT,
  collected_by         TEXT NOT NULL,
  collected_date       TEXT NOT NULL,
  expiry_date          TEXT,
  jira_key             TEXT,
  jira_url             TEXT,
  github_issue_url     TEXT,
  github_issue_number  INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Audit Log (append-only) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY NOT NULL,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
  tool          TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  role          TEXT NOT NULL,
  params_json   TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('success','denied','error')),
  error_message TEXT,
  duration_ms   INTEGER NOT NULL,
  row_hash      TEXT NOT NULL
);
`;

const MIGRATION_0002 = `-- ============================================================
-- iso27001-mcp  Migration 0002 — FTS5 Search Index & Indexes
-- Separated from 0001 so FTS5 availability can be confirmed
-- independently before the index population step.
-- ============================================================

-- ── Full-Text Search (FTS5) ──────────────────────────────────
-- Powers search_controls tool. Searches name, description, and
-- guidance text. content= links to the controls table so the
-- FTS index never stores duplicate data.

CREATE VIRTUAL TABLE IF NOT EXISTS controls_fts USING fts5(
  control_id UNINDEXED,
  name,
  description,
  guidance,
  content='controls',
  content_rowid='rowid'
);

-- ── Performance Indexes ──────────────────────────────────────

-- Gap analysis aggregations
CREATE INDEX IF NOT EXISTS idx_control_statuses_assessment
  ON control_statuses(assessment_id, status);

-- Risk register
CREATE INDEX IF NOT EXISTS idx_risks_level
  ON risks(risk_level);
CREATE INDEX IF NOT EXISTS idx_risks_status
  ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_score
  ON risks(risk_score DESC);

-- Policy review scheduling
CREATE INDEX IF NOT EXISTS idx_policies_review
  ON policies(next_review_date, status);

-- CAR deadline tracking
CREATE INDEX IF NOT EXISTS idx_cars_status
  ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_cars_due_date
  ON corrective_actions(due_date, status);

-- Evidence lookup by control
CREATE INDEX IF NOT EXISTS idx_evidence_control
  ON evidence(control_id);

-- Audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_tool
  ON audit_log(tool, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_outcome
  ON audit_log(outcome, timestamp);

-- Clause requirement hierarchy
CREATE INDEX IF NOT EXISTS idx_clause_req_parent
  ON clause_requirements(parent_id);
`;

const MIGRATION_0003 = `-- ============================================================
-- iso27001-mcp  Migration 0003 — Organization Profile & Procedures
-- Adds: organization_profile (singleton), procedures, procedure_versions
-- ============================================================

-- ── Organization Profile (singleton) ─────────────────────────
-- Application enforces singleton semantics via a fixed UUID.
-- INSERT OR REPLACE with ORG_PROFILE_ID is the only write path.

CREATE TABLE IF NOT EXISTS organization_profile (
  id                       TEXT PRIMARY KEY NOT NULL,
  legal_entity_name        TEXT NOT NULL,
  registered_jurisdiction  TEXT NOT NULL,
  regulatory_licences      TEXT,          -- JSON array of strings
  in_scope_activities      TEXT NOT NULL,
  isms_scope_statement     TEXT NOT NULL,
  declared_exclusions      TEXT,          -- free text or JSON array
  raci_roles               TEXT NOT NULL DEFAULT '{}', -- JSON: {ciso,dpo,data_owner,isms_manager,internal_auditor}
  review_cadence_months    INTEGER NOT NULL DEFAULT 12,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Procedures ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procedures (
  id                  TEXT PRIMARY KEY NOT NULL,
  procedure_type      TEXT NOT NULL CHECK (procedure_type IN (
                        'access_provisioning','incident_handling','change_management',
                        'backup_restore','vulnerability_management','supplier_onboarding',
                        'cryptographic_key_management','data_classification_handling',
                        'secure_development_workflow','bcp_testing',
                        'asset_onboarding_offboarding','audit_log_review'
                      )),
  policy_id           TEXT REFERENCES policies(id) ON DELETE SET NULL,
  organisation_name   TEXT NOT NULL,
  scope               TEXT NOT NULL,
  owner               TEXT NOT NULL,
  approver            TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  version             INTEGER NOT NULL DEFAULT 1,
  content             TEXT NOT NULL,
  clause_mappings     TEXT,              -- JSON array
  control_mappings    TEXT,              -- JSON array (from template frontmatter)
  related_controls    TEXT,             -- JSON array (caller-supplied override)
  review_cycle_months INTEGER NOT NULL DEFAULT 12,
  effective_date      TEXT NOT NULL,
  next_review_date    TEXT NOT NULL,
  reviewed_by         TEXT,
  approved_by         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Procedure Version History ─────────────────────────────────

CREATE TABLE IF NOT EXISTS procedure_versions (
  id             TEXT PRIMARY KEY NOT NULL,
  procedure_id   TEXT NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  content        TEXT NOT NULL,
  change_summary TEXT,
  reviewed_by    TEXT,
  archived_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(procedure_id, version)
);

-- ── Performance Indexes ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_procedures_policy
  ON procedures(policy_id);
CREATE INDEX IF NOT EXISTS idx_procedures_review
  ON procedures(next_review_date, status);
CREATE INDEX IF NOT EXISTS idx_procedures_type
  ON procedures(procedure_type, status);
`;

const MIGRATION_0004 = `-- ============================================================
-- iso27001-mcp  Migration 0004 — Management Review & Improvement Plan
-- Clause 9.3 (Management Review) and Clause 10.1 (Improvement Opportunities)
-- ============================================================

-- ── Management Reviews (ISO 27001:2022 Clause 9.3) ───────────

CREATE TABLE IF NOT EXISTS management_reviews (
  id           TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL,
  review_date  TEXT NOT NULL,
  reviewers    TEXT NOT NULL,
  scope_notes  TEXT,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
  completed_at TEXT,
  completed_by TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Review Inputs (ISO 27001:2022 Clause 9.3.2) ──────────────

CREATE TABLE IF NOT EXISTS review_inputs (
  id             TEXT PRIMARY KEY NOT NULL,
  review_id      TEXT NOT NULL REFERENCES management_reviews(id) ON DELETE CASCADE,
  input_category TEXT NOT NULL CHECK (input_category IN (
    'previous_action_status',
    'external_internal_issues',
    'interested_party_needs',
    'isms_performance',
    'interested_party_feedback',
    'risk_assessment_results',
    'improvement_opportunities'
  )),
  summary    TEXT NOT NULL,
  details    TEXT,
  trend      TEXT CHECK (trend IN ('improving','stable','declining','insufficient_data')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(review_id, input_category)
);

-- ── Review Outputs (ISO 27001:2022 Clause 9.3.3) ─────────────

CREATE TABLE IF NOT EXISTS review_outputs (
  id          TEXT PRIMARY KEY NOT NULL,
  review_id   TEXT NOT NULL REFERENCES management_reviews(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL CHECK (output_type IN (
    'improvement_decision',
    'isms_change_decision'
  )),
  decision   TEXT NOT NULL,
  owner      TEXT,
  due_date   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Improvement Opportunities (ISO 27001:2022 Clause 10.1) ───

CREATE TABLE IF NOT EXISTS improvement_opportunities (
  id          TEXT PRIMARY KEY NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN (
    'management_review','risk_assessment','audit','monitoring','other'
  )),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  owner       TEXT,
  target_date TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','in_progress','implemented','closed'
  )),
  review_id   TEXT REFERENCES management_reviews(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Performance Indexes ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_management_reviews_status
  ON management_reviews(status, review_date DESC);

CREATE INDEX IF NOT EXISTS idx_review_inputs_review
  ON review_inputs(review_id, input_category);

CREATE INDEX IF NOT EXISTS idx_review_outputs_review
  ON review_outputs(review_id, output_type);

CREATE INDEX IF NOT EXISTS idx_improvement_opps_status
  ON improvement_opportunities(status, priority);

CREATE INDEX IF NOT EXISTS idx_improvement_opps_review
  ON improvement_opportunities(review_id);
`;

const MIGRATION_0005 = `-- ============================================================
-- iso27001-mcp  Migration 0005 — Generated Evidence Documents
-- Supports the generate_evidence_document tool (Group 14).
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_evidence (
  id                TEXT PRIMARY KEY NOT NULL,
  template_type     TEXT NOT NULL CHECK (template_type IN (
    'access_review_attestation',
    'training_acknowledgement',
    'supplier_security_questionnaire',
    'incident_post_mortem',
    'bcp_test_report',
    'risk_treatment_sign_off'
  )),
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  organisation_name TEXT NOT NULL,
  generated_by      TEXT NOT NULL,
  clause_mappings   TEXT,
  control_mappings  TEXT,
  template_vars     TEXT NOT NULL DEFAULT '{}',
  evidence_id       TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generated_evidence_type
  ON generated_evidence(template_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_evidence_generated_by
  ON generated_evidence(generated_by, created_at DESC);
`;

const MIGRATION_0006 = `-- ============================================================
-- iso27001-mcp  Migration 0006 — Audit Log HMAC Hardening
-- Adds prev_hash column to audit_log for hash-chain integrity.
-- After this migration, row_hash is computed as HMAC-SHA256 over
-- ALL fields (id, timestamp, tool, key_hash, role, params_json,
-- outcome, error_message, duration_ms, prev_hash), replacing the
-- former SHA-256 over 4 fields only.
-- !! Never edit this file after it has been applied !!
-- ============================================================

-- SQLite does not support ALTER TABLE ADD COLUMN with NOT NULL
-- without a default; prev_hash is nullable (NULL = first in chain).
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
`;

const MIGRATION_0007 = `-- ============================================================
-- iso27001-mcp  Migration 0007 — Organisation Profile Branding
-- Adds optional branding and document personalisation fields.
-- !! Never edit this file after it has been applied !!
-- ============================================================
ALTER TABLE organization_profile ADD COLUMN logo_url TEXT;
ALTER TABLE organization_profile ADD COLUMN primary_color TEXT;
ALTER TABLE organization_profile ADD COLUMN document_footer TEXT;
ALTER TABLE organization_profile ADD COLUMN certification_body TEXT;
`;

/**
 * All migrations in application order.
 * The runner applies them sequentially, skipping already-applied ones.
 * Never reorder or remove entries — add new entries at the end only.
 */
export const MIGRATIONS: Migration[] = [
  { filename: "0001_initial.sql",                          sql: MIGRATION_0001 },
  { filename: "0002_fts_index.sql",                        sql: MIGRATION_0002 },
  { filename: "0003_org_profile_procedures.sql",           sql: MIGRATION_0003 },
  { filename: "0004_management_review_improvement.sql",    sql: MIGRATION_0004 },
  { filename: "0005_evidence_documents.sql",               sql: MIGRATION_0005 },
  { filename: "0006_audit_log_hmac.sql",                   sql: MIGRATION_0006 },
  { filename: "0007_org_profile_branding.sql",             sql: MIGRATION_0007 },
];
