/**
 * iso27001-mcp — Group 13: Improvement Plan handlers (Clause 10.1)
 *
 * Proactive improvement opportunities — NOT linked to nonconformities
 * (those remain in corrective_actions). Status transitions are
 * forward-only: open → in_progress → implemented → closed.
 *
 * create_improvement_opportunity — register a new opportunity
 * update_improvement_opportunity — advance status or update fields
 * get_improvement_opportunity    — fetch a single opportunity
 * list_improvement_opportunities — paginated list with filters
 */

import { getDb }             from "../db/connection.js";
import { newId, now }        from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";

// ── Types ─────────────────────────────────────────────────────

interface OpportunityRow {
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

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── Forward-only status transition guard ──────────────────────
// open(0) → in_progress(1) → implemented(2) → closed(3)

const STATUS_ORDINAL: Record<string, number> = {
  open:        0,
  in_progress: 1,
  implemented: 2,
  closed:      3,
};

function requireOpportunity(id: string): OpportunityRow {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM improvement_opportunities WHERE id = ?").get(id) as OpportunityRow | undefined;
  if (!row) throw notFound("improvement_opportunity", id);
  return row;
}

// ── Health rating helper ──────────────────────────────────────
// Provides a simple health snapshot for the improvement backlog.

function computeHealthRating(stats: {
  open: number;
  in_progress: number;
  implemented: number;
  closed: number;
  overdue: number;
}): string {
  const active = stats.open + stats.in_progress;
  if (stats.overdue > 3)   return "at_risk";
  if (active > 10)          return "needs_attention";
  if (active === 0)         return "excellent";
  if (stats.overdue === 0)  return "good";
  return "fair";
}

// ── Handlers ──────────────────────────────────────────────────

export function handleCreateImprovementOpportunity(args: Record<string, unknown>): ToolResult {
  const { title, description, source, priority, owner, target_date, review_id } = args as {
    title:        string;
    description:  string;
    source:       string;
    priority?:    string;
    owner?:       string;
    target_date?: string;
    review_id?:   string;
  };

  const db = getDb();
  const id = newId();
  const ts = now();

  db.prepare(`
    INSERT INTO improvement_opportunities
      (id, title, description, source, priority, owner, target_date, status, review_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(
    id, title, description, source,
    priority ?? "medium",
    owner ?? null,
    target_date ?? null,
    review_id ?? null,
    ts, ts,
  );

  return ok({
    opportunity_id: id,
    title,
    source,
    priority: priority ?? "medium",
    status:   "open",
    created_at: ts,
  });
}

export function handleUpdateImprovementOpportunity(args: Record<string, unknown>): ToolResult {
  const { opportunity_id, status, owner, target_date, priority, description } = args as {
    opportunity_id: string;
    status?:        string;
    owner?:         string;
    target_date?:   string;
    priority?:      string;
    description?:   string;
  };

  const opp = requireOpportunity(opportunity_id);

  // Enforce forward-only status transitions
  if (status !== undefined) {
    const currentOrdinal = STATUS_ORDINAL[opp.status] ?? 0;
    const newOrdinal     = STATUS_ORDINAL[status]     ?? 0;

    if (newOrdinal < currentOrdinal) {
      throw businessRule(
        "status",
        `Status transition '${opp.status}' → '${status}' is not permitted. ` +
        `Improvement opportunity status can only advance forward: ` +
        `open → in_progress → implemented → closed.`,
      );
    }
  }

  const db = getDb();
  const ts = now();

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [ts];

  if (status      !== undefined) { updates.push("status = ?");      params.push(status); }
  if (owner       !== undefined) { updates.push("owner = ?");       params.push(owner); }
  if (target_date !== undefined) { updates.push("target_date = ?"); params.push(target_date); }
  if (priority    !== undefined) { updates.push("priority = ?");    params.push(priority); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description); }

  params.push(opportunity_id);
  db.prepare(`UPDATE improvement_opportunities SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM improvement_opportunities WHERE id = ?")
    .get(opportunity_id) as OpportunityRow;

  return ok(updated);
}

export function handleGetImprovementOpportunity(args: Record<string, unknown>): ToolResult {
  const { opportunity_id } = args as { opportunity_id: string };
  const opp = requireOpportunity(opportunity_id);
  return ok(opp);
}

export function handleListImprovementOpportunities(args: Record<string, unknown>): ToolResult {
  const { status, source, priority, review_id, limit = 50, offset = 0 } = args as {
    status?:    string;
    source?:    string;
    priority?:  string;
    review_id?: string;
    limit?:     number;
    offset?:    number;
  };

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status)    { conditions.push("status = ?");    params.push(status); }
  if (source)    { conditions.push("source = ?");    params.push(source); }
  if (priority)  { conditions.push("priority = ?");  params.push(priority); }
  if (review_id) { conditions.push("review_id = ?"); params.push(review_id); }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const rows = db.prepare(`
    SELECT * FROM improvement_opportunities
    ${where}
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      target_date ASC NULLS LAST,
      created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as OpportunityRow[];

  // Compute health summary across the full (unfiltered) backlog
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'implemented' THEN 1 ELSE 0 END) AS implemented,
      SUM(CASE WHEN status = 'closed'      THEN 1 ELSE 0 END) AS closed,
      SUM(
        CASE WHEN status IN ('open','in_progress')
              AND target_date IS NOT NULL
              AND target_date < date('now') THEN 1 ELSE 0 END
      ) AS overdue
    FROM improvement_opportunities
  `).get() as { open: number; in_progress: number; implemented: number; closed: number; overdue: number };

  return ok({
    total:  rows.length,
    offset,
    limit,
    opportunities: rows,
    health: {
      open:        stats.open        ?? 0,
      in_progress: stats.in_progress ?? 0,
      implemented: stats.implemented ?? 0,
      closed:      stats.closed      ?? 0,
      overdue:     stats.overdue     ?? 0,
      rating:      computeHealthRating({
        open:        stats.open        ?? 0,
        in_progress: stats.in_progress ?? 0,
        implemented: stats.implemented ?? 0,
        closed:      stats.closed      ?? 0,
        overdue:     stats.overdue     ?? 0,
      }),
    },
  });
}
