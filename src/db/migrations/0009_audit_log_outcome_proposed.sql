-- ============================================================
-- iso27001-mcp  Migration 0009 — Widen audit_log outcome CHECK
--
-- Adds 'proposed' to the outcome CHECK constraint so HITL
-- preview tool calls can be recorded without violating SQLite.
--
-- Background: migration 0001 created audit_log with
--   CHECK (outcome IN ('success','denied','error'))
-- The HITL feature (hitl_proposed: true) introduced a fourth
-- outcome value 'proposed'. SQLite cannot ALTER COLUMN
-- constraints, so this migration recreates the table in full,
-- preserving all columns from 0001 + 0006 (prev_hash) +
-- 0008 (actor_type, model_id), then copies all existing rows.
--
-- !! Never edit this file after it has been applied !!
-- ============================================================

-- Step 1: Create replacement table with widened CHECK
CREATE TABLE audit_log_new (
  id            TEXT    PRIMARY KEY NOT NULL,
  timestamp     TEXT    NOT NULL DEFAULT (datetime('now')),
  tool          TEXT    NOT NULL,
  key_hash      TEXT    NOT NULL,
  role          TEXT    NOT NULL,
  params_json   TEXT    NOT NULL,
  outcome       TEXT    NOT NULL CHECK (outcome IN ('success','denied','error','proposed')),
  error_message TEXT,
  duration_ms   INTEGER NOT NULL,
  row_hash      TEXT    NOT NULL,
  prev_hash     TEXT,
  actor_type    TEXT    NOT NULL DEFAULT 'ai' CHECK (actor_type IN ('ai','human','system')),
  model_id      TEXT
);

-- Step 2: Copy all existing rows verbatim
INSERT INTO audit_log_new
  SELECT id, timestamp, tool, key_hash, role, params_json,
         outcome, error_message, duration_ms, row_hash,
         prev_hash, actor_type, model_id
  FROM audit_log;

-- Step 3: Swap tables
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

-- Step 4: Recreate indexes (dropped with the old table)
CREATE INDEX IF NOT EXISTS idx_audit_log_tool
  ON audit_log(tool, timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_log_outcome
  ON audit_log(outcome, timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type
  ON audit_log(actor_type, timestamp);
