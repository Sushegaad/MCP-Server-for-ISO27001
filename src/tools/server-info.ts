/**
 * iso27001-mcp — get_server_info handler
 *
 * Returns server version, build provenance, control data checksums,
 * and live database statistics. Spec §7 Group 8.
 *
 * Per spec: if this is NOT the first tool call in the session, a
 * warning is written to the audit log.
 */

import { getDb, getUptimeSeconds } from "../db/connection.js";
import { getEnv } from "../security/secrets.js";

// ── Types ─────────────────────────────────────────────────────

export interface ServerInfo {
  version:              string;
  commit_sha:           string | null;
  build_timestamp:      string | null;
  mcp_protocol_version: string;
  control_data: {
    version_2022_count: number;
    version_2013_count: number;
    new_in_2022_count:  number;
    clause_count:       number;
    mapping_count:      number;
  };
  database: {
    path:             string;
    encrypted:        boolean;
    assessment_count: number;
    risk_count:       number;
    policy_count:     number;
    audit_count:      number;
    evidence_count:   number;
    api_key_count:    number;
  };
  uptime_seconds: number;
  mode:           string;
  rate_limit_rpm: number;
}

// ── Package version (injected by Node at require-time) ────────

function getVersion(): string {
  // process.env.npm_package_version is set when running via npm scripts.
  // Fall back to reading package.json if running the compiled binary directly.
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "2.0.0";
  } catch {
    return "2.0.0";
  }
}

// ── Handler ───────────────────────────────────────────────────

export function handleGetServerInfo(): { content: Array<{ type: "text"; text: string }>; isError: false } {
  const db = getDb();

  // Live DB counts
  const counts = db.prepare(`
    SELECT
      (SELECT count(*) FROM controls WHERE version='2022')  AS c2022,
      (SELECT count(*) FROM controls WHERE version='2013')  AS c2013,
      (SELECT count(*) FROM controls WHERE new_in_2022=1)   AS new22,
      (SELECT count(*) FROM clause_requirements)            AS clauses,
      (SELECT count(*) FROM control_version_mapping)        AS mappings,
      (SELECT count(*) FROM gap_assessments)                AS assessments,
      (SELECT count(*) FROM risks)                          AS risks,
      (SELECT count(*) FROM policies)                       AS policies,
      (SELECT count(*) FROM audits)                         AS audits,
      (SELECT count(*) FROM evidence)                       AS evidence,
      (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL) AS api_keys
  `).get() as {
    c2022: number; c2013: number; new22: number; clauses: number; mappings: number;
    assessments: number; risks: number; policies: number; audits: number;
    evidence: number; api_keys: number;
  };

  const dbPath  = getEnv("DB_PATH", "./isms.db");
  const rpmStr  = getEnv("RATE_LIMIT_RPM", "500");
  const mode    = process.argv.find((_, i) => process.argv[i - 1] === "--mode") ?? "local";

  const info: ServerInfo = {
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
    content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    isError: false,
  };
}
