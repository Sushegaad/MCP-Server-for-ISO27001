/**
 * iso27001-mcp — Organization Profile MCP Resource
 *
 * Registers one static resource (viewer auth required):
 *
 *   iso27001://org/profile
 *     Singleton organization profile record containing the ISMS scope
 *     statement, RACI roles, and registration metadata.
 *     Returned as JSON.
 *
 * Unlike other resources this is a static URI (no path variables),
 * so we use server.resource() with a plain string instead of a
 * ResourceTemplate.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";
import { assertResourceAuth } from "./resource-auth.js";

// ── Types ─────────────────────────────────────────────────────

interface OrgProfileRow {
  id:                      string;
  legal_entity_name:       string;
  registered_jurisdiction: string;
  regulatory_licences:     string | null; // JSON array
  in_scope_activities:     string;
  isms_scope_statement:    string;
  declared_exclusions:     string | null;
  raci_roles:              string;        // JSON object
  review_cadence_months:   number;
  created_at:              string;
  updated_at:              string;
}

// ── Registration ──────────────────────────────────────────────

export function registerOrgProfileResource(server: McpServer): void {

  // ── iso27001://org/profile ───────────────────────────────────
  server.resource(
    "iso27001-org-profile",
    "iso27001://org/profile",
    {
      description: "Singleton ISMS organization profile. Fields: legal_entity_name, registered_jurisdiction, regulatory_licences, in_scope_activities, isms_scope_statement, declared_exclusions, raci_roles, review_cadence_months. Use set_organization_profile to update.",
      mimeType:    "application/json",
    },
    async (
      uri: URL,
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
    ): Promise<ReadResourceResult> => {
      assertResourceAuth(extra);

      const row = getDb()
        .prepare("SELECT * FROM organization_profile LIMIT 1")
        .get() as OrgProfileRow | undefined;

      if (!row) {
        return {
          contents: [{
            uri:      uri.toString(),
            mimeType: "application/json",
            text:     JSON.stringify({ profile: null }, null, 2),
          }],
        };
      }

      const serialized = {
        ...row,
        regulatory_licences: fromJsonArray<string>(row.regulatory_licences),
        raci_roles:          JSON.parse(row.raci_roles) as Record<string, string>,
      };

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serialized, null, 2),
        }],
      };
    },
  );
}
