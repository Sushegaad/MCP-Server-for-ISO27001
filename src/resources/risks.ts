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
