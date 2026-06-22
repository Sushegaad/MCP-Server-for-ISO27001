/**
 * iso27001-mcp — Policy MCP Resources
 *
 * Registers two resource templates (viewer auth required):
 *
 *   iso27001://policy/{policy_id}
 *     Current version of a policy, returned as Markdown with a
 *     YAML frontmatter envelope containing metadata.
 *     List callback enumerates non-archived policies.
 *
 *   iso27001://policy/{policy_id}/version/{version}
 *     Archived version content from the policy_versions table.
 *     No list callback (sub-template).
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";
import type { PolicyRow, PolicyVersionRow } from "../db/types.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Frontmatter envelope ──────────────────────────────────────

/**
 * Prepend a YAML-style frontmatter block to the stored Markdown content.
 * This makes the resource self-describing when Claude reads it directly
 * without needing to parse a separate metadata call.
 */
function wrapWithFrontmatter(row: PolicyRow): string {
  const clauseMappings  = fromJsonArray<string>(row.clause_mappings);
  const controlMappings = fromJsonArray<string>(row.control_mappings);

  const frontmatter = [
    "---",
    `uri: iso27001://policy/${row.id}`,
    `type: ${row.type}`,
    `organisation_name: "${row.organisation_name}"`,
    `version: ${row.version}`,
    `status: ${row.status}`,
    `owner: "${row.owner}"`,
    `approver: "${row.approver ?? "TBD"}"`,
    `effective_date: ${row.effective_date}`,
    `next_review_date: ${row.next_review_date}`,
    `review_cycle_months: ${row.review_cycle_months}`,
    `clause_mappings: ${JSON.stringify(clauseMappings)}`,
    `control_mappings: ${JSON.stringify(controlMappings)}`,
    `created_at: ${row.created_at}`,
    `updated_at: ${row.updated_at}`,
    "---",
    "",
  ].join("\n");

  return frontmatter + row.content;
}

function wrapVersionWithFrontmatter(row: PolicyVersionRow, policyId: string): string {
  const frontmatter = [
    "---",
    `uri: iso27001://policy/${policyId}/version/${row.version}`,
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

export function registerPolicyResources(server: McpServer): void {

  // ── iso27001://policy/{policy_id} ────────────────────────────
  server.resource(
    "iso27001-policy",
    new ResourceTemplate("iso27001://policy/{policy_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, type, organisation_name, version, status, effective_date
               FROM policies
              WHERE status != 'archived'
              ORDER BY type, created_at DESC`,
          )
          .all() as Pick<PolicyRow, "id" | "type" | "organisation_name" | "version" | "status" | "effective_date">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://policy/${r.id}`,
            name:        `${r.type} — ${r.organisation_name} (v${r.version})`,
            description: `ISO 27001 ${r.type} policy, status: ${r.status}, effective: ${r.effective_date}`,
            mimeType:    "text/markdown",
          })),
        };
      },
    }),
    {
      description: "Current version of an ISO 27001 ISMS policy document, returned as Markdown with YAML frontmatter. Includes clause and control mappings.",
      mimeType:    "text/markdown",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { policy_id } = variables as { policy_id: string };
      const row = getDb()
        .prepare("SELECT * FROM policies WHERE id = ?")
        .get(policy_id) as PolicyRow | undefined;

      if (!row) {
        throw new Error(`Policy not found: '${policy_id}'. Use list_policies to find valid IDs.`);
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

  // ── iso27001://policy/{policy_id}/version/{version} ──────────
  server.resource(
    "iso27001-policy-versioned",
    new ResourceTemplate("iso27001://policy/{policy_id}/version/{version}", {
      list: undefined, // Enumerate via parent iso27001-policy + get_policy(include_versions=true)
    }),
    {
      description: "Archived version of an ISO 27001 policy document. Use get_policy with include_versions=true to discover available version numbers.",
      mimeType:    "text/markdown",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { policy_id, version } = variables as { policy_id: string; version: string };
      const versionNum = parseInt(version, 10);

      if (isNaN(versionNum) || versionNum < 1) {
        throw new Error(`Invalid version: '${version}'. Must be a positive integer.`);
      }

      const row = getDb()
        .prepare(
          "SELECT * FROM policy_versions WHERE policy_id = ? AND version = ?",
        )
        .get(policy_id, versionNum) as PolicyVersionRow | undefined;

      if (!row) {
        throw new Error(
          `Policy version not found: policy '${policy_id}' version ${versionNum}. ` +
          "Use get_policy with include_versions=true to see available versions.",
        );
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "text/markdown",
          text:     wrapVersionWithFrontmatter(row, policy_id),
        }],
      };
    },
  );
}
