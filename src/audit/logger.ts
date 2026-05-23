/**
 * iso27001-mcp — Tamper-evident audit logger
 *
 * writeAuditEvent() — inserts to audit_log table + appends JSON-L line
 *
 * The row_hash is HMAC-SHA256 (keyed with HMAC_SECRET) over ALL fields:
 *   id | timestamp | tool | key_hash | role | params_json |
 *   outcome | error_message | duration_ms | prev_hash
 *
 * prev_hash chains each row to its predecessor — any gap or reorder
 * in the chain is detectable via verifyRowHash + verifyChain.
 *
 * NEVER logged:
 *   • Raw API keys
 *   • DB encryption key (DB_ENCRYPTION_KEY)
 *   • Auth tokens in URLs
 *   • Full policy content (log policy_id + version only)
 */

import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { getDb } from "../db/connection.js";
import { requireEnv, getEnv } from "../security/secrets.js";

// ── AUDIT_LOG_PATH validation ─────────────────────────────────

/**
 * Resolve and validate the audit log file path.
 *
 * Rejects paths that:
 *   • resolve into privileged system directories (/etc, /proc, /sys, /dev)
 *   • have a file extension other than .jsonl or .log
 *
 * This prevents an attacker with env-var control from redirecting the append
 * stream into a sensitive system file (e.g. /etc/cron.d/something).
 */
function resolveAuditLogPath(raw: string): string {
  const abs = resolve(raw);

  // Reject system directories
  const FORBIDDEN_PREFIXES = ["/etc/", "/proc/", "/sys/", "/dev/"];
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (abs.startsWith(prefix)) {
      throw new Error(
        `[audit] AUDIT_LOG_PATH "${abs}" points to a system directory. ` +
        `Use a writable application directory instead.`,
      );
    }
  }

  // Reject unexpected file extensions
  const ext = extname(abs).toLowerCase();
  if (ext !== "" && ext !== ".jsonl" && ext !== ".log") {
    throw new Error(
      `[audit] AUDIT_LOG_PATH "${abs}" has an unexpected extension "${ext}". ` +
      `Only .jsonl or .log files are permitted.`,
    );
  }

  return abs;
}

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
  prev_hash: string | null;   // null for the first row (genesis); links to previous row_hash
  row_hash:  string;
}

// ── writeAuditEvent ───────────────────────────────────────────

/**
 * Write a tamper-evident audit event to:
 *   1. The `audit_log` SQLite table
 *   2. The flat JSON-L file at AUDIT_LOG_PATH (for SIEM ingestion)
 *
 * row_hash = HMAC-SHA256(HMAC_SECRET, all 9 fields + prev_hash)
 * prev_hash chains each row to its predecessor for tamper-chain detection.
 */
export function writeAuditEvent(event: AuditEventInput): AuditEvent {
  const db        = getDb();
  const id        = randomUUID();
  const timestamp = new Date().toISOString().replace("T", " ").split(".")[0] + "Z";

  // ── Hash chain: load the most recent row_hash ─────────────
  const prevRow = db.prepare(
    "SELECT row_hash FROM audit_log ORDER BY rowid DESC LIMIT 1",
  ).get() as { row_hash: string } | undefined;
  const prev_hash = prevRow?.row_hash ?? null;

  // ── HMAC-SHA256 over all fields + chain link ──────────────
  const hmacSecret = requireEnv("HMAC_SECRET");
  const hashInput = [
    id,
    timestamp,
    event.tool,
    event.key_hash,
    event.role,
    event.params_json,
    event.outcome,
    event.error_message ?? "",
    String(event.duration_ms),
    prev_hash ?? "GENESIS",
  ].join("|");

  const row_hash = createHmac("sha256", hmacSecret)
    .update(hashInput)
    .digest("hex");

  db.prepare(`
    INSERT INTO audit_log
      (id, timestamp, tool, key_hash, role, params_json,
       outcome, error_message, duration_ms, prev_hash, row_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    prev_hash,
    row_hash,
  );

  const full: AuditEvent = { id, timestamp, prev_hash, row_hash, ...event };

  // Append to flat JSON-L file — non-fatal if the write fails
  try {
    const logPath = resolveAuditLogPath(getEnv("AUDIT_LOG_PATH", "./audit.jsonl"));
    appendFileSync(logPath, JSON.stringify(full) + "\n", "utf8");
  } catch (err) {
    console.error("[audit] Warning: failed to write to AUDIT_LOG_PATH:", err);
  }

  return full;
}

// ── verifyRowHash ─────────────────────────────────────────────

/**
 * Verify the row_hash of an audit log entry.
 * Returns true if the stored hash matches a fresh HMAC-SHA256 computation
 * over all fields including the chain link (prev_hash).
 * Used in admin tooling and tests to detect tampering.
 */
export function verifyRowHash(entry: AuditEvent): boolean {
  const hmacSecret = requireEnv("HMAC_SECRET");
  const hashInput = [
    entry.id,
    entry.timestamp,
    entry.tool,
    entry.key_hash,
    entry.role,
    entry.params_json,
    entry.outcome,
    entry.error_message ?? "",
    String(entry.duration_ms),
    entry.prev_hash ?? "GENESIS",
  ].join("|");

  const expected = createHmac("sha256", hmacSecret)
    .update(hashInput)
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
