/**
 * iso27001-mcp — Management Review & Improvement Plan MCP Resources
 *
 * Registers two resource templates (viewer auth required):
 *
 *   iso27001://management-review/{review_id}
 *     Full management review record with all inputs and outputs nested.
 *     List callback enumerates all reviews ordered by review_date DESC.
 *
 *   iso27001://improvement-plan
 *     Singleton resource: full improvement opportunity backlog with
 *     health rating. No URI variables — clients fetch the fixed URI.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb }           from "../db/connection.js";
import { fromJsonArray, PRIORITY_SORT_SQL } from "../db/dal.js";
import type { OpportunityRow } from "../db/types.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Types ─────────────────────────────────────────────────────

interface ReviewRow {
  id:           string;
  title:        string;
  review_date:  string;
  reviewers:    string;   // JSON array
  scope_notes:  string | null;
  status:       string;
  completed_at: string | null;
  completed_by: string | null;
  created_at:   string;
  updated_at:   string;
}

interface ReviewInputRow {
  id:             string;
  review_id:      string;
  input_category: string;
  summary:        string;
  details:        string | null;
  trend:          string | null;
  created_at:     string;
  updated_at:     string;
}

interface ReviewOutputRow {
  id:          string;
  review_id:   string;
  output_type: string;
  decision:    string;
  owner:       string | null;
  due_date:    string | null;
  created_at:  string;
  updated_at:  string;
}

// ── Registration ──────────────────────────────────────────────

export function registerManagementReviewResources(server: McpServer): void {

  // ── iso27001://management-review/{review_id} ─────────────────
  server.resource(
    "iso27001-management-review",
    new ResourceTemplate("iso27001://management-review/{review_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, title, review_date, status, completed_at
               FROM management_reviews
              ORDER BY review_date DESC`,
          )
          .all() as Pick<ReviewRow, "id" | "title" | "review_date" | "status" | "completed_at">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://management-review/${r.id}`,
            name:        r.title,
            description: `Management review on ${r.review_date}, status: ${r.status}` +
                         (r.completed_at ? `, completed: ${r.completed_at}` : ""),
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 management review record (Clause 9.3) with all inputs (9.3.2) and output decisions (9.3.3) nested. Fields: id, title, review_date, reviewers, scope_notes, status, completed_at, completed_by, inputs[], outputs[].",
      mimeType:    "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { review_id } = variables as { review_id: string };
      const db = getDb();

      const review = db
        .prepare("SELECT * FROM management_reviews WHERE id = ?")
        .get(review_id) as ReviewRow | undefined;

      if (!review) {
        throw new Error(
          `Management review not found: '${review_id}'. Use list_management_reviews to find valid IDs.`,
        );
      }

      const inputs = db
        .prepare(
          "SELECT * FROM review_inputs WHERE review_id = ? ORDER BY input_category ASC",
        )
        .all(review_id) as ReviewInputRow[];

      const outputs = db
        .prepare(
          "SELECT * FROM review_outputs WHERE review_id = ? ORDER BY created_at ASC",
        )
        .all(review_id) as ReviewOutputRow[];

      const payload = {
        ...review,
        reviewers: fromJsonArray<string>(review.reviewers),
        inputs,
        outputs,
      };

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(payload, null, 2),
        }],
      };
    },
  );

  // ── iso27001://improvement-plan (singleton) ──────────────────
  server.resource(
    "iso27001-improvement-plan",
    new ResourceTemplate("iso27001://improvement-plan", { list: undefined }),
    {
      description: "ISO 27001 improvement opportunity backlog (Clause 10.1). Returns all opportunities sorted by priority and target date, with a health rating (excellent/good/fair/needs_attention/at_risk) and counts by status.",
      mimeType:    "application/json",
    },
    (uri, _variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const db = getDb();

      const opportunities = db
        .prepare(`
          SELECT * FROM improvement_opportunities
          ORDER BY
            ${PRIORITY_SORT_SQL} ASC,
            target_date ASC NULLS LAST,
            created_at DESC
        `)
        .all() as OpportunityRow[];

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

      const open        = stats.open        ?? 0;
      const in_progress = stats.in_progress ?? 0;
      const implemented = stats.implemented ?? 0;
      const closed      = stats.closed      ?? 0;
      const overdue     = stats.overdue     ?? 0;

      let rating: string;
      const active = open + in_progress;
      if (overdue > 3)  rating = "at_risk";
      else if (active > 10) rating = "needs_attention";
      else if (active === 0) rating = "excellent";
      else if (overdue === 0) rating = "good";
      else rating = "fair";

      const payload = {
        total: opportunities.length,
        health: { open, in_progress, implemented, closed, overdue, rating },
        opportunities,
      };

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(payload, null, 2),
        }],
      };
    },
  );
}
