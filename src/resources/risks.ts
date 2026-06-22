/**
 * iso27001-mcp — Risk MCP Resources
 *
 * Registers one resource template (viewer auth required):
 *
 *   iso27001://risk/{risk_id}
 *     Risk record with generated score/level columns, plus all
 *     associated risk treatments nested under a `treatments` array.
 *     Returned as JSON.
 *     List callback enumerates all non-closed risks ordered by risk_score DESC.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Types ─────────────────────────────────────────────────────

interface RiskRow {
  id:               string;
  asset:            string;
  threat:           string;
  vulnerability:    string;
  likelihood:       number;
  impact:           number;
  risk_score:       number;
  risk_level:       string;
  owner:            string | null;
  status:           string;
  related_controls: string | null; // JSON array
  created_at:       string;
  updated_at:       string;
}

interface TreatmentRow {
  id:                   string;
  risk_id:              string;
  treatment_type:       string;
  description:          string;
  owner:                string;
  due_date:             string;
  controls:             string | null; // JSON array
  status:               string;
  residual_likelihood:  number | null;
  residual_impact:      number | null;
  residual_risk_score:  number | null;
  residual_risk_level:  string | null;
  evidence_ref:         string | null;
  created_at:           string;
  updated_at:           string;
}

// ── Serialization ─────────────────────────────────────────────

function serializeTreatment(t: TreatmentRow): object {
  return {
    ...t,
    controls: fromJsonArray<string>(t.controls),
  };
}

function serializeRisk(risk: RiskRow, treatments: TreatmentRow[]): object {
  return {
    ...risk,
    related_controls: fromJsonArray<string>(risk.related_controls),
    treatments:       treatments.map(serializeTreatment),
  };
}

// ── Registration ──────────────────────────────────────────────

export function registerRiskResources(server: McpServer): void {

  // ── iso27001://risks/summary ──────────────────────────────────
  server.resource(
    "iso27001-risks-summary",
    "iso27001://risks/summary",
    {
      description:
        "Aggregate risk statistics: total count, breakdown by level/status/treatment type, " +
        "top-10 risks by score, open treatment count, and a 5×5 likelihood×impact heatmap matrix.",
      mimeType: "application/json",
    },
    (_uri: URL, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const db = getDb();

      const byLevel = db.prepare(
        "SELECT risk_level, count(*) AS count FROM risks GROUP BY risk_level",
      ).all() as { risk_level: string; count: number }[];

      const byStatus = db.prepare(
        "SELECT status, count(*) AS count FROM risks GROUP BY status",
      ).all() as { status: string; count: number }[];

      const byTreatment = db.prepare(
        "SELECT treatment_type, count(*) AS count FROM risk_treatments GROUP BY treatment_type",
      ).all() as { treatment_type: string; count: number }[];

      const total = (db.prepare("SELECT count(*) AS n FROM risks").get() as { n: number }).n;

      const top10 = db.prepare(`
        SELECT id, asset, threat, risk_score, risk_level, status, owner
        FROM risks ORDER BY risk_score DESC LIMIT 10
      `).all() as { id: string; asset: string; threat: string; risk_score: number;
                    risk_level: string; status: string; owner: string | null }[];

      const openTreatments = (db.prepare(`
        SELECT count(*) AS n FROM risk_treatments WHERE status IN ('planned','in_progress')
      `).get() as { n: number }).n;

      const heatmapRows = db.prepare(`
        SELECT likelihood, impact, count(*) AS count FROM risks GROUP BY likelihood, impact
      `).all() as { likelihood: number; impact: number; count: number }[];

      const heatmap: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0) as number[]);
      for (const r of heatmapRows) {
        heatmap[r.likelihood - 1][r.impact - 1] = r.count;
      }

      const summary = {
        total_risks:     total,
        by_level:        byLevel,
        by_status:       byStatus,
        by_treatment:    byTreatment,
        open_treatments: openTreatments,
        top_10_by_score: top10,
        heatmap_5x5: {
          description: "Row = likelihood (1–5), Column = impact (1–5), value = risk count",
          matrix:      heatmap,
        },
      };

      return {
        contents: [{
          uri:      "iso27001://risks/summary",
          mimeType: "application/json",
          text:     JSON.stringify(summary, null, 2),
        }],
      };
    },
  );

  // ── iso27001://risk/{risk_id} ────────────────────────────────
  server.resource(
    "iso27001-risk",
    new ResourceTemplate("iso27001://risk/{risk_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, asset, threat, risk_score, risk_level, status, owner
               FROM risks
              WHERE status != 'closed'
              ORDER BY risk_score DESC, created_at DESC`,
          )
          .all() as Pick<RiskRow, "id" | "asset" | "threat" | "risk_score" | "risk_level" | "status" | "owner">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://risk/${r.id}`,
            name:        `[${r.risk_level}] ${r.asset} — ${r.threat}`,
            description: `Risk score: ${r.risk_score}, status: ${r.status}${r.owner ? `, owner: ${r.owner}` : ""}`,
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 risk record with calculated risk_score and risk_level, plus nested treatments array. Fields: id, asset, threat, vulnerability, likelihood, impact, risk_score, risk_level, owner, status, related_controls, treatments[].",
      mimeType:    "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { risk_id } = variables as { risk_id: string };
      const db = getDb();

      const risk = db
        .prepare("SELECT * FROM risks WHERE id = ?")
        .get(risk_id) as RiskRow | undefined;

      if (!risk) {
        throw new Error(`Risk not found: '${risk_id}'. Use list_risks or search_risks to find valid IDs.`);
      }

      const treatments = db
        .prepare("SELECT * FROM risk_treatments WHERE risk_id = ? ORDER BY created_at ASC")
        .all(risk_id) as TreatmentRow[];

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeRisk(risk, treatments), null, 2),
        }],
      };
    },
  );
}
