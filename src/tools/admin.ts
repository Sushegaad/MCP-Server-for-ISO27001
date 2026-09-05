/**
 * iso27001-mcp — Group 9: Admin & Key Management handlers
 *
 * query_audit_log, list_api_keys, revoke_api_key
 *
 * Moved out of tools/index.ts so the unified registry (registry.ts) can
 * reference them like every other domain handler.
 */

import { getDb } from "../db/connection.js";
import { listKeys, revokeKey } from "../auth/api-key.js";
import { removeSessionsByKeyHash } from "../auth/session-store.js";
import { businessRule } from "../types/errors.js";
import { ok, type ToolResult } from "../types/result.js";
import { type DiffRow, buildPreviewResponse, consumeProposal } from "./hitl-utils.js";

// ── query_audit_log ───────────────────────────────────────────

export function handleQueryAuditLog(args: Record<string, unknown>): ToolResult {
  const db = getDb();
  const {
    start_date, end_date, tool, outcome, role, key_hash, actor_type,
    limit = 50, offset = 0,
  } = args as {
    start_date?: string; end_date?: string; tool?: string;
    outcome?: string; role?: string; key_hash?: string;
    actor_type?: "ai" | "human" | "system";
    limit?: number; offset?: number;
  };

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (start_date)  { conditions.push("timestamp >= ?");  params.push(start_date); }
  if (end_date)    { conditions.push("timestamp <= ?");  params.push(end_date + "T23:59:59Z"); }
  if (tool)        { conditions.push("tool = ?");        params.push(tool); }
  if (outcome)     { conditions.push("outcome = ?");     params.push(outcome); }
  if (role)        { conditions.push("role = ?");        params.push(role); }
  if (key_hash)    { conditions.push("key_hash = ?");    params.push(key_hash); }
  if (actor_type)  { conditions.push("actor_type = ?"); params.push(actor_type); }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const sql   = `SELECT id, timestamp, tool, role, outcome, error_message,
                        duration_ms, prev_hash, row_hash, actor_type, model_id
                 FROM audit_log ${where}
                 ORDER BY timestamp DESC
                 LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  return ok({ total: rows.length, offset, limit, entries: rows });
}

// ── list_api_keys ─────────────────────────────────────────────

export function handleListApiKeys(_args: Record<string, unknown>): ToolResult {
  const keys = listKeys();
  return ok({ count: keys.length, keys });
}

// ── revoke_api_key ────────────────────────────────────────────

export function handleRevokeApiKey(args: Record<string, unknown>): ToolResult {
  const { label, confirmed = false, proposal_id } = args as {
    label: string; confirmed?: boolean; proposal_id?: string;
  };

  // Look up the target key (api_keys has no updated_at column, so the
  // proposal is bound to caller + args only — no resource_version).
  const key = getDb().prepare(
    "SELECT key_hash, label, role, last_used_at, revoked_at FROM api_keys WHERE label = ?"
  ).get(label) as {
    key_hash: string; label: string; role: string;
    last_used_at: string | null; revoked_at: string | null;
  } | undefined;
  if (!key) {
    throw businessRule("label", `API key with label '${label}' not found.`);
  }

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [
      { field: "label",     old: key.label, new: key.label },
      { field: "role",      old: key.role,  new: key.role },
      { field: "last_used", old: key.last_used_at, new: key.last_used_at },
      { field: "status",    old: key.revoked_at ? "revoked" : "active", new: "revoked" },
    ];
    return ok(buildPreviewResponse("revoke_api_key", rows, {
      label,
      message: "⏸ No data written. Warning: revocation is permanent and evicts the key's live sessions. Pass \"confirmed\": true to revoke.",
    }));
  }

  consumeProposal(proposal_id, "revoke_api_key");
  revokeKey(label);

  // A revoked key's live SSE sessions must not survive revocation — evict
  // every session token minted under this key's hash.
  const sessionsEvicted = removeSessionsByKeyHash(key.key_hash);

  return ok({ revoked: true, label, sessions_evicted: sessionsEvicted });
}
