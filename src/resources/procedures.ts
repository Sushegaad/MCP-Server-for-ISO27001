/**
 * iso27001-mcp — Procedure MCP Resources
 *
 * Registers two resource templates (viewer auth required):
 *
 *   iso27001://procedure/{procedure_id}
 *     Current version of a procedure, returned as Markdown with a
 *     YAML frontmatter envelope containing metadata.
 *     List callback enumerates non-archived procedures.
 *
 *   iso27001://procedure/{procedure_id}/version/{version}
 *     Archived version content from the procedure_versions table.
 *     No list callback (sub-template).
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Types ─────────────────────────────────────────────────────

interface ProcedureRow {
  id:                  string;
  procedure_type:      string;
  policy_id:           string | null;
  organisation_name:   string;
  scope:               string;
  owner:               string;
  approver:            string | null;
  status:              string;
  version:             number;
  content:             string;
  clause_mappings:     string | null;
  control_mappings:    string | null;
  related_controls:    string | null;
  review_cycle_months: number;
  effective_date:      string;
  next_review_date:    string;
  reviewed_by:         string | null;
  approved_by:         string | null;
  created_at:          string;
  updated_at:          string;
}

interface ProcedureVersionRow {
  id:             string;
  procedure_id:   string;
  version:        number;
  content:        string;
  change_summary: string | null;
  reviewed_by:    string | null;
  archived_at:    string;
}

// ── Frontmatter envelope ──────────────────────────────────────

/**
 * Prepend a YAML-style frontmatter block to the stored Markdown content.
 * This makes the resource self-describing when Claude reads it directly
 * without needing to parse a separate metadata call.
 */
function wrapWithFrontmatter(row: ProcedureRow): string {
  const clauseMappings   = fromJsonArray<string>(row.clause_mappings);
  const controlMappings  = fromJsonArray<string>(row.control_mappings);
  const relatedControls  = fromJsonArray<string>(row.related_controls);

  const frontmatter = [
    "---",
    `uri: iso27001://procedure/${row.id}`,
    `procedure_type: ${row.procedure_type}`,
    `policy_id: "${row.policy_id ?? ""}"`,
    `organisation_name: "${row.organisation_name}"`,
    `scope: "${row.scope}"`,
    `version: ${row.version}`,
    `status: ${row.status}`,
    `owner: "${row.owner}"`,
    `approver: "${row.approver ?? "TBD"}"`,
    `effective_date: ${row.effective_date}`,
    `next_review_date: ${row.next_review_date}`,
    `review_cycle_months: ${row.review_cycle_months}`,
    `clause_mappings: ${JSON.stringify(clauseMappings)}`,
    `control_mappings: ${JSON.stringify(controlMappings)}`,
    `related_controls: ${JSON.stringify(relatedControls)}`,
    `created_at: ${row.created_at}`,
    `updated_at: ${row.updated_at}`,
    "---",
    "",
  ].join("\n");

  return frontmatter + row.content;
}

function wrapVersionWithFrontmatter(row: ProcedureVersionRow, procedureId: string): string {
  const frontmatter = [
    "---",
    `uri: iso27001://procedure/${procedureId}/version/${row.version}`,
    `version: ${row.version}`,
    `change_summary: "${row.change_summary ?? ""}"`,
    `reviewed_by: "${row.reviewed_by ?? ""}"`,
    `archived_at: ${row.archived_at}`,
    "---",
    "",
  ].join("\n");

  return frontmatter + row.content;
}

// ── Registration ──────────────────────────────────────────────

export function registerProcedureResources(server: McpServer): void {

  // ── iso27001://procedure/{procedure_id} ──────────────────────
  server.resource(
    "iso27001-procedure",
    new ResourceTemplate("iso27001://procedure/{procedure_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, procedure_type, organisation_name, version, status, effective_date
               FROM procedures
              WHERE status != 'archived'
              ORDER BY procedure_type, created_at DESC`,
          )
          .all() as Pick<ProcedureRow, "id" | "procedure_type" | "organisation_name" | "version" | "status" | "effective_date">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://procedure/${r.id}`,
            name:        `${r.procedure_type} — ${r.organisation_name} (v${r.version})`,
            description: `ISO 27001 ${r.procedure_type} procedure, status: ${r.status}, effective: ${r.effective_date}`,
            mimeType:    "text/markdown",
          })),
        };
      },
    }),
    {
      description: "Current version of an ISO 27001 ISMS procedure document, returned as Markdown with YAML frontmatter. Includes clause and control mappings, and link to parent policy.",
      mimeType:    "text/markdown",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { procedure_id } = variables as { procedure_id: string };
      const row = getDb()
        .prepare("SELECT * FROM procedures WHERE id = ?")
        .get(procedure_id) as ProcedureRow | undefined;

      if (!row) {
        throw new Error(`Procedure not found: '${procedure_id}'. Use list_procedures to find valid IDs.`);
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "text/markdown",
          text:     wrapWithFrontmatter(row),
        }],
      };
    },
  );

  // ── iso27001://procedure/{procedure_id}/version/{version} ────
  server.resource(
    "iso27001-procedure-versioned",
    new ResourceTemplate("iso27001://procedure/{procedure_id}/version/{version}", {
      list: undefined, // Enumerate via parent iso27001-procedure + get_procedure(include_versions=true)
    }),
    {
      description: "Archived version of an ISO 27001 procedure document. Use get_procedure with include_versions=true to discover available version numbers.",
      mimeType:    "text/markdown",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { procedure_id, version } = variables as { procedure_id: string; version: string };
      const versionNum = parseInt(version, 10);

      if (isNaN(versionNum) || versionNum < 1) {
        throw new Error(`Invalid version: '${version}'. Must be a positive integer.`);
      }

      const row = getDb()
        .prepare(
          "SELECT * FROM procedure_versions WHERE procedure_id = ? AND version = ?",
        )
        .get(procedure_id, versionNum) as ProcedureVersionRow | undefined;

      if (!row) {
        throw new Error(
          `Procedure version not found: procedure '${procedure_id}' version ${versionNum}. ` +
          "Use get_procedure with include_versions=true to see available versions.",
        );
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "text/markdown",
          text:     wrapVersionWithFrontmatter(row, procedure_id),
        }],
      };
    },
  );
}
