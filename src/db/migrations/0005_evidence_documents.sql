-- ============================================================
-- iso27001-mcp  Migration 0005 — Generated Evidence Documents
-- Supports the generate_evidence_document tool (Group 14).
-- !! Never edit this file after it has been applied !!
-- !! Create a new migration for any schema change       !!
-- ============================================================

-- ── Generated Evidence Documents ─────────────────────────────
-- Stores the rendered Mustache output from generate_evidence_document.
-- evidence_id is a back-link to the evidence table — the tool writes
-- both tables atomically so every generated doc is immediately
-- registered as evidence for the target control.

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
  content           TEXT NOT NULL,         -- rendered Markdown
  organisation_name TEXT NOT NULL,
  generated_by      TEXT NOT NULL,
  clause_mappings   TEXT,                  -- JSON array (from template frontmatter)
  control_mappings  TEXT,                  -- JSON array (from template frontmatter)
  template_vars     TEXT NOT NULL DEFAULT '{}',  -- JSON of caller-supplied vars
  evidence_id       TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Performance Indexes ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_generated_evidence_type
  ON generated_evidence(template_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_evidence_generated_by
  ON generated_evidence(generated_by, created_at DESC);
