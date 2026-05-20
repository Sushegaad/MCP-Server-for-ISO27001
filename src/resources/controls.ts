/**
 * iso27001-mcp — Control and Clause MCP Resources
 *
 * Registers three resource templates (no auth — public ISO 27001 reference data):
 *
 *   iso27001://control/{control_id}
 *     Latest version of a control (2022 preferred, 2013 fallback).
 *     List callback enumerates all 2022 controls.
 *
 *   iso27001://control/{control_id}/version/{version}
 *     Control at an explicit standard version ("2022" or "2013").
 *     No list callback (enumeration via parent template).
 *
 *   iso27001://clause/{clause_id}
 *     ISO 27001:2022 clause requirement (clauses 4–10).
 *     List callback enumerates all clause requirements.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";

// ── Types ─────────────────────────────────────────────────────

interface ControlRow {
  id:               string;
  control_id:       string;
  version:          string;
  name:             string;
  theme:            string;
  description:      string;
  guidance:         string | null;
  control_type:     string;        // JSON array
  attributes:       string | null; // JSON object (2022 only)
  related_controls: string | null; // JSON array
  new_in_2022:      number;
  iso_clause_refs:  string | null; // JSON array
  created_at:       string;
}

interface ClauseRow {
  id:                   string;
  clause_id:            string;
  parent_id:            string | null;
  title:                string;
  requirement_text:     string;
  implementation_notes: string | null;
  related_controls:     string | null; // JSON array
  created_at:           string;
}

function serializeControl(row: ControlRow): object {
  return {
    ...row,
    control_type:     JSON.parse(row.control_type) as string[],
    attributes:       row.attributes       ? JSON.parse(row.attributes) as Record<string, unknown> : null,
    related_controls: fromJsonArray<string>(row.related_controls),
    iso_clause_refs:  fromJsonArray<string>(row.iso_clause_refs),
    new_in_2022:      row.new_in_2022 === 1,
  };
}

function serializeClause(row: ClauseRow): object {
  return {
    ...row,
    related_controls: fromJsonArray<string>(row.related_controls),
  };
}

// ── Registration ──────────────────────────────────────────────

export function registerControlResources(server: McpServer): void {

  // ── iso27001://control/{control_id} ───────────────────────────
  server.resource(
    "iso27001-control",
    new ResourceTemplate("iso27001://control/{control_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            "SELECT control_id, name, theme, description FROM controls WHERE version='2022' ORDER BY control_id",
          )
          .all() as { control_id: string; name: string; theme: string; description: string }[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://control/${r.control_id}`,
            name:        `${r.control_id} — ${r.name}`,
            description: r.description.slice(0, 150) + (r.description.length > 150 ? "…" : ""),
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 control definition — returns the 2022 version where available, 2013 otherwise. Fields: control_id, name, theme, description, guidance, control_type, attributes (2022), related_controls, iso_clause_refs.",
      mimeType:    "application/json",
    },
    (uri, variables): ReadResourceResult => {
      const { control_id } = variables as { control_id: string };
      const row = getDb()
        .prepare(
          `SELECT * FROM controls
           WHERE control_id = ?
           ORDER BY CASE version WHEN '2022' THEN 0 ELSE 1 END
           LIMIT 1`,
        )
        .get(control_id) as ControlRow | undefined;

      if (!row) {
        throw new Error(`Control not found: '${control_id}'. Use list_controls or search_controls to find valid IDs.`);
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeControl(row), null, 2),
        }],
      };
    },
  );

  // ── iso27001://control/{control_id}/version/{version} ─────────
  server.resource(
    "iso27001-control-versioned",
    new ResourceTemplate("iso27001://control/{control_id}/version/{version}", {
      list: undefined, // Sub-template; enumerate via parent iso27001-control
      complete: {
        version: () => ["2022", "2013"],
      },
    }),
    {
      description: "ISO 27001 control at a specific standard version ('2022' or '2013'). Use this to compare how a control changed between editions.",
      mimeType:    "application/json",
    },
    (uri, variables): ReadResourceResult => {
      const { control_id, version } = variables as { control_id: string; version: string };
      const row = getDb()
        .prepare("SELECT * FROM controls WHERE control_id = ? AND version = ?")
        .get(control_id, version) as ControlRow | undefined;

      if (!row) {
        throw new Error(`Control not found: '${control_id}' version '${version}'. Valid versions: 2022, 2013.`);
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeControl(row), null, 2),
        }],
      };
    },
  );

  // ── iso27001://clause/{clause_id} ─────────────────────────────
  server.resource(
    "iso27001-clause",
    new ResourceTemplate("iso27001://clause/{clause_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            "SELECT clause_id, title FROM clause_requirements ORDER BY clause_id",
          )
          .all() as { clause_id: string; title: string }[];

        return {
          resources: rows.map((r) => ({
            uri:      `iso27001://clause/${r.clause_id}`,
            name:     `Clause ${r.clause_id} — ${r.title}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001:2022 clause requirement (clauses 4–10). Fields: clause_id, title, requirement_text, implementation_notes, related_controls.",
      mimeType:    "application/json",
    },
    (uri, variables): ReadResourceResult => {
      const { clause_id } = variables as { clause_id: string };
      const row = getDb()
        .prepare("SELECT * FROM clause_requirements WHERE clause_id = ?")
        .get(clause_id) as ClauseRow | undefined;

      if (!row) {
        throw new Error(`Clause not found: '${clause_id}'. Use list_clause_requirements to browse valid clause IDs.`);
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeClause(row), null, 2),
        }],
      };
    },
  );
}
