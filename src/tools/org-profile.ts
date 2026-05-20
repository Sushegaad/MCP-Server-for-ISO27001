/**
 * iso27001-mcp — Group 10: Organization Profile handlers
 *
 * set_organization_profile  (admin)  — upsert the singleton org profile
 * get_organization_profile  (viewer) — retrieve the singleton org profile
 *
 * Also exports loadOrgProfileDefaults() used by policies.ts and procedures.ts
 * to auto-inject organisation_name and scope when callers omit them.
 */

import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection.js";
import { now } from "../db/dal.js";

// ── Constants ─────────────────────────────────────────────────

/**
 * Fixed UUID for singleton semantics.
 * INSERT OR REPLACE with this ID is the only write path — a second row
 * for the org profile is unreachable by application code.
 */
const ORG_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

// ── Types ─────────────────────────────────────────────────────

interface OrgProfileRow {
  id:                      string;
  legal_entity_name:       string;
  registered_jurisdiction: string;
  regulatory_licences:     string | null;   // JSON array
  in_scope_activities:     string;
  isms_scope_statement:    string;
  declared_exclusions:     string | null;
  raci_roles:              string;          // JSON object
  review_cadence_months:   number;
  created_at:              string;
  updated_at:              string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── Shared helper ─────────────────────────────────────────────

/**
 * Returns { organisation_name, scope } from the org profile row if one
 * exists, or null if the profile has never been set.
 *
 * Imported by policies.ts and procedures.ts for auto-injection:
 *   const defaults = loadOrgProfileDefaults(db);
 *   const orgName  = organisation_name ?? defaults?.organisation_name;
 */
export function loadOrgProfileDefaults(
  db: Database,
): { organisation_name: string; scope: string } | null {
  const row = db
    .prepare("SELECT legal_entity_name, isms_scope_statement FROM organization_profile WHERE id = ?")
    .get(ORG_PROFILE_ID) as
    | { legal_entity_name: string; isms_scope_statement: string }
    | undefined;

  if (!row) return null;

  return {
    organisation_name: row.legal_entity_name,
    scope:             row.isms_scope_statement,
  };
}

// ── set_organization_profile ──────────────────────────────────

export function handleSetOrganizationProfile(args: Record<string, unknown>): ToolResult {
  const {
    legal_entity_name,
    registered_jurisdiction,
    regulatory_licences,
    in_scope_activities,
    isms_scope_statement,
    declared_exclusions,
    raci_roles,
    review_cadence_months = 12,
  } = args as {
    legal_entity_name:       string;
    registered_jurisdiction: string;
    regulatory_licences?:    string[];
    in_scope_activities:     string;
    isms_scope_statement:    string;
    declared_exclusions?:    string;
    raci_roles?: {
      ciso?:              string;
      dpo?:               string;
      data_owner?:        string;
      isms_manager?:      string;
      internal_auditor?:  string;
    };
    review_cadence_months?: number;
  };

  const ts = now();

  getDb().prepare(`
    INSERT OR REPLACE INTO organization_profile
      (id, legal_entity_name, registered_jurisdiction, regulatory_licences,
       in_scope_activities, isms_scope_statement, declared_exclusions,
       raci_roles, review_cadence_months, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
      (SELECT created_at FROM organization_profile WHERE id = ?), ?
    ), ?)
  `).run(
    ORG_PROFILE_ID,
    legal_entity_name,
    registered_jurisdiction,
    regulatory_licences ? JSON.stringify(regulatory_licences) : null,
    in_scope_activities,
    isms_scope_statement,
    declared_exclusions ?? null,
    JSON.stringify(raci_roles ?? {}),
    review_cadence_months,
    ORG_PROFILE_ID,
    ts,
    ts,
  );

  return ok({
    id:                      ORG_PROFILE_ID,
    legal_entity_name,
    registered_jurisdiction,
    regulatory_licences:     regulatory_licences ?? [],
    in_scope_activities,
    isms_scope_statement,
    declared_exclusions:     declared_exclusions ?? null,
    raci_roles:              raci_roles ?? {},
    review_cadence_months,
    updated_at:              ts,
  });
}

// ── get_organization_profile ──────────────────────────────────

export function handleGetOrganizationProfile(_args: Record<string, unknown>): ToolResult {
  const row = getDb()
    .prepare("SELECT * FROM organization_profile WHERE id = ? LIMIT 1")
    .get(ORG_PROFILE_ID) as OrgProfileRow | undefined;

  if (!row) {
    return ok({ profile: null });
  }

  return ok({
    profile: {
      id:                      row.id,
      legal_entity_name:       row.legal_entity_name,
      registered_jurisdiction: row.registered_jurisdiction,
      regulatory_licences:     row.regulatory_licences
        ? (JSON.parse(row.regulatory_licences) as string[])
        : [],
      in_scope_activities:     row.in_scope_activities,
      isms_scope_statement:    row.isms_scope_statement,
      declared_exclusions:     row.declared_exclusions ?? null,
      raci_roles:              JSON.parse(row.raci_roles) as Record<string, string>,
      review_cadence_months:   row.review_cadence_months,
      created_at:              row.created_at,
      updated_at:              row.updated_at,
    },
  });
}
