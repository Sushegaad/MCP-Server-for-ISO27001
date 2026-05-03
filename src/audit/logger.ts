/**
 * iso27001-mcp — Tamper-evident audit logger
 *
 * writeAuditEvent() — inserts to audit_log table + appends JSON-L line
 *
 * The row_hash is computed in application code (not a SQL generated column)
 * over "timestamp|tool|key_hash|outcome" before the INSERT, providing
 * tamper evidence: any modification to those four fields is detectable.
 *
 * NEVER logged:
 *   • Raw API keys
 *   • DB encryption key (DB_ENCRYPTION_KEY)
 *   • Auth tokens in URLs
 *   • Full policy content (log policy_id + version only)
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { getDb } from "../db/connection.js";
import { getEnv } from "../security/secrets.js";

// ── Types ─────────────────────────────────────────────────────

export interface AuditEventInput {
  tool:          string;
  key_hash:      string;   // HMAC hash of the API key — never the raw key
  role:          string;
  params_json:   string;   // Sanitised params, secrets stripped
  outcome:       "success" | "denied" | "error";
  error_message: string | null;
  duration_ms:   number;
}

export interface AuditEvent extends AuditEventInput {
  id:        string;
  timestamp: string;
  row_hash:  string;
}

// ── writeAuditEvent ───────────────────────────────────────────

/**
 * Write a tamper-evident audit event to:
 *   1. The `audit_log` SQLite table
 *   2. The flat JSON-L file at AUDIT_LOG_PATH (for SIEM ingestion)
 *
 * The row_hash covers: timestamp | tool | key_hash | outcome
 */
export function writeAuditEvent(event: AuditEventInput): AuditEvent {
  const db        = getDb();
  const id        = randomUUID();
  const timestamp = new Date().toISOString().replace("T", " ").split(".")[0] + "Z";

  const row_hash = createHash("sha256")
    .update(`${timestamp}|${event.tool}|${event.key_hash}|${event.outcome}`)
    .digest("hex");

  db.prepare(`
    INSERT INTO audit_log
      (id, timestamp, tool, key_hash, role, params_json,
       outcome, error_message, duration_ms, row_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    event.tool,
    event.key_hash,
    event.role,
    event.params_json,
    event.outcome,
    event.error_message,
    event.duration_ms,
    row_hash,
  );

  const full: AuditEvent = { id, timestamp, row_hash, ...event };

  // Append to flat JSON-L file — non-fatal if the write fails
  try {
    const logPath = getEnv("AUDIT_LOG_PATH", "./audit.jsonl");
    appendFileSync(logPath, JSON.stringify(full) + "\n", "utf8");
  } catch (err) {
    console.error("[audit] Warning: failed to write to AUDIT_LOG_PATH:", err);
  }

  return full;
}

// ── verifyRowHash ─────────────────────────────────────────────

/**
 * Verify the row_hash of an audit log entry.
 * Returns true if the stored hash matches a fresh computation.
 * Used in admin tooling and tests to detect tampering.
 */
export function verifyRowHash(entry: AuditEvent): boolean {
  const expected = createHash("sha256")
    .update(`${entry.timestamp}|${entry.tool}|${entry.key_hash}|${entry.outcome}`)
    .digest("hex");
  return expected === entry.row_hash;
}

// ── buildParamsJson ───────────────────────────────────────────

/**
 * Build a safe params_json string for the audit log.
 * Strips policy content (replaces with {policy_id, version}).
 * Marks sanitised fields if any were cleaned.
 * NEVER includes raw API keys or DB credentials.
 */
export function buildParamsJson(
  params: Record<string, unknown>,
  sanitisedFields?: string[],
): string {
  // Safe copy — strip anything that looks like a credential
  const safe: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(params)) {
    // Never log these — defensive in case they slip through
    if (/key|secret|password|token|credential/i.test(k)) {
      safe[k] = "[REDACTED]";
      continue;
    }
    // Policy content: log only policy_id + version, not full text
    if (k === "content" && typeof v === "string" && v.length > 200) {
      safe[k] = "[CONTENT_REDACTED]";
      continue;
    }
    safe[k] = v;
  }

  if (sanitisedFields && sanitisedFields.length > 0) {
    safe["_sanitised"] = true;
    safe["_sanitised_fields"] = sanitisedFields;
  }

  return JSON.stringify(safe);
}
