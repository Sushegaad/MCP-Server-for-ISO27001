/**
 * iso27001-mcp — Improvement Plan MCP Resource
 *
 * Registers one resource template (viewer auth required):
 *
 *   iso27001://improvement-plan/{opportunity_id}
 *     Single improvement opportunity (Clause 10.1).
 *     List callback enumerates all non-closed opportunities ordered by
 *     priority (critical → high → medium → low) then target_date ASC.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb }            from "../db/connection.js";
import { PRIORITY_SORT_SQL } from "../db/dal.js";
import type { OpportunityRow } from "../db/types.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Registration ──────────────────────────────────────────────

export function registerImprovementPlanResources(server: McpServer): void {

  // ── iso27001://improvement-plan/{opportunity_id} ──────────────
  server.resource(
    "iso27001-improvement-plan",
    new ResourceTemplate("iso27001://improvement-plan/{opportunity_id}", {
      list: () => {
        const rows = getDb()
          .prepare(`
            SELECT id, title, priority, status, owner, target_date
            FROM improvement_opportunities
            WHERE status != 'closed'
            ORDER BY
              ${PRIORITY_SORT_SQL} ASC,
              target_date ASC,
              created_at DESC
          `)
          .all() as Pick<OpportunityRow, "id" | "title" | "priority" | "status" | "owner" | "target_date">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://improvement-plan/${r.id}`,
            name:        `[${r.priority}] ${r.title}`,
            description: `Status: ${r.status}${r.owner ? `, owner: ${r.owner}` : ""}${r.target_date ? `, due: ${r.target_date}` : ""}`,
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description:
        "ISO 27001:2022 Clause 10.1 improvement opportunity. " +
        "Fields: id, title, description, source, priority, owner, target_date, status, review_id.",
      mimeType: "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { opportunity_id } = variables as { opportunity_id: string };

      const row = getDb()
        .prepare("SELECT * FROM improvement_opportunities WHERE id = ?")
        .get(opportunity_id) as OpportunityRow | undefined;

      if (!row) {
        throw new Error(
          `Improvement opportunity not found: '${opportunity_id}'. ` +
          "Use list_improvement_opportunities to find valid IDs.",
        );
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(row, null, 2),
        }],
      };
    },
  );
}
