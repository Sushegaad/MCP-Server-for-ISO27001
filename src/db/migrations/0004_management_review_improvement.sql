-- ============================================================
-- iso27001-mcp  Migration 0004 — Management Review & Improvement Plan
-- Clause 9.3 (Management Review) and Clause 10.1 (Improvement Opportunities)
-- !! Never edit this file after it has been applied !!
-- !! Create a new migration for any schema change       !!
-- ============================================================

-- ── Management Reviews (ISO 27001:2022 Clause 9.3) ───────────
-- Singleton semantics NOT enforced here — organisations may hold
-- multiple reviews per year. Application enforces that a review
-- cannot be completed until all 7 mandatory 9.3.2 input categories
-- have been recorded.

CREATE TABLE IF NOT EXISTS management_reviews (
  id           TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL,
  review_date  TEXT NOT NULL,
  reviewers    TEXT NOT NULL,          -- JSON array of names/roles
  scope_notes  TEXT,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
  completed_at TEXT,
  completed_by TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Review Inputs (ISO 27001:2022 Clause 9.3.2) ──────────────
-- The 7 mandatory input categories from 9.3.2 a–g are enforced
-- as a CHECK constraint. UNIQUE(review_id, input_category) prevents
-- duplicate entries for the same category within a review.

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
-- The output_type CHECK enforces the two required output categories
-- from 9.3.3 a–b. Multiple output records per review are permitted.

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
-- Proactive improvement items NOT tied to a nonconformity (those
-- remain in corrective_actions). review_id is nullable — an
-- opportunity may originate outside of a formal management review.
-- Status transitions are forward-only (enforced by application):
--   open → in_progress → implemented → closed

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
