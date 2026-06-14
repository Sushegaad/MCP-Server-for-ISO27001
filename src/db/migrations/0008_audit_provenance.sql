-- ============================================================
-- iso27001-mcp  Migration 0008 — Audit Log Provenance
-- Adds actor_type and model_id columns so each audit row records
-- who (or what) triggered the action and which model was running.
--
-- actor_type  IN ('ai','human','system')  DEFAULT 'ai'
-- model_id    TEXT   nullable — e.g. "claude-sonnet-4-6"
--
-- Both fields are included in the HMAC-SHA256 hash chain so
-- provenance claims are tamper-evident.
--
-- !! Rows written before this migration retain actor_type='ai'
-- !! and model_id=NULL (SQLite virtual default) but their
-- !! row_hash was computed over the pre-0008 field set and will
-- !! not pass verifyRowHash() with the post-0008 algorithm.
-- !! This is expected — the same limitation exists for rows
-- !! written before migration 0006 (prev_hash).
-- !! Never edit this file after it has been applied !!
-- ============================================================

ALTER TABLE audit_log ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'ai'
  CHECK (actor_type IN ('ai','human','system'));

ALTER TABLE audit_log ADD COLUMN model_id TEXT;

-- Index for filtering/grouping audit queries by actor
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type
  ON audit_log(actor_type, timestamp);
