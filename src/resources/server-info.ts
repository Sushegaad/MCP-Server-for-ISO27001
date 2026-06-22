/**
 * iso27001-mcp — Server Info MCP Resource
 *
 * Registers one static resource (no auth required):
 *
 *   iso27001://server/info
 *     Server version, build provenance, control data counts, and live
 *     database statistics. Identical payload to the former get_server_info
 *     tool, but accessible without a tool call so it doesn't consume
 *     context-window tool-schema slots.
 */

import type { McpServer }        from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb, getUptimeSeconds } from "../db/connection.js";
import { getEnv }                 from "../security/secrets.js";

// ── Package version helper ────────────────────────────────────

function getVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "2.0.0";
  } catch {
    return "2.0.0";
  }
}

// ── Registration ──────────────────────────────────────────────

export function registerServerInfoResource(server: McpServer): void {

  // ── iso27001://server/info ─────────────────────────────────────
  server.resource(
    "iso27001-server-info",
    "iso27001://server/info",
    {
      description:
        "Server version, build metadata, control data counts, and live database statistics. " +
        "No authentication required.",
      mimeType: "application/json",
    },
    (_uri: URL, _extra): ReadResourceResult => {
      const db = getDb();

      const counts = db.prepare(`
        SELECT
          (SELECT count(*) FROM controls WHERE version='2022')           AS c2022,
          (SELECT count(*) FROM controls WHERE version='2013')           AS c2013,
          (SELECT count(*) FROM controls WHERE new_in_2022=1)            AS new22,
          (SELECT count(*) FROM clause_requirements)                     AS clauses,
          (SELECT count(*) FROM control_version_mapping)                 AS mappings,
          (SELECT count(*) FROM gap_assessments)                         AS assessments,
          (SELECT count(*) FROM risks)                                   AS risks,
          (SELECT count(*) FROM policies)                                AS policies,
          (SELECT count(*) FROM audits)                                  AS audits,
          (SELECT count(*) FROM evidence)                                AS evidence,
          (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL)       AS api_keys
      `).get() as {
        c2022: number; c2013: number; new22: number; clauses: number; mappings: number;
        assessments: number; risks: number; policies: number;
        audits: number; evidence: number; api_keys: number;
      };

      const dbPath = getEnv("DB_PATH", "./isms.db");
      const rpmStr = getEnv("RATE_LIMIT_RPM", "500");
      const mode   = process.argv.find((_, i) => process.argv[i - 1] === "--mode") ?? "local";

      const info = {
        version:              getVersion(),
        commit_sha:           process.env.GIT_COMMIT_SHA ?? null,
        build_timestamp:      process.env.BUILD_TIMESTAMP ?? null,
        mcp_protocol_version: "2024-11-05",
        control_data: {
          version_2022_count: counts.c2022,
          version_2013_count: counts.c2013,
          new_in_2022_count:  counts.new22,
          clause_count:       counts.clauses,
          mapping_count:      counts.mappings,
        },
        database: {
          path:             dbPath,
          encrypted:        true,
          assessment_count: counts.assessments,
          risk_count:       counts.risks,
          policy_count:     counts.policies,
          audit_count:      counts.audits,
          evidence_count:   counts.evidence,
          api_key_count:    counts.api_keys,
        },
        uptime_seconds: getUptimeSeconds(),
        mode,
        rate_limit_rpm: parseInt(rpmStr, 10) || 500,
      };

      return {
        contents: [{
          uri:      "iso27001://server/info",
          mimeType: "application/json",
          text:     JSON.stringify(info, null, 2),
        }],
      };
    },
  );
}
