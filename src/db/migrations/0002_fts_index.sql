-- ============================================================
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
