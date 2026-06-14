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
import { ok, type ToolResult } from "../types/result.js";

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
  logo_url:           string | null;
  primary_color:      string | null;
  document_footer:    string | null;
  certification_body: string | null;
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
): { organisation_name: string; scope: string; logo_url: string | null; primary_color: string | null; document_footer: string | null; certification_body: string | null } | null {
  const row = db
    .prepare("SELECT legal_entity_name, isms_scope_statement, logo_url, primary_color, document_footer, certification_body FROM organization_profile WHERE id = ?")
    .get(ORG_PROFILE_ID) as
    | { legal_entity_name: string; isms_scope_statement: string; logo_url: string | null; primary_color: string | null; document_footer: string | null; certification_body: string | null }
    | undefined;

  if (!row) return null;

  return {
    organisation_name:  row.legal_entity_name,
    scope:              row.isms_scope_statement,
    logo_url:           row.logo_url,
    primary_color:      row.primary_color,
    document_footer:    row.document_footer,
    certification_body: row.certification_body,
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
    logo_url,
    primary_color,
    document_footer,
    certification_body,
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
    logo_url?:           string;
    primary_color?:      string;
    document_footer?:    string;
    certification_body?: string;
  };

  const ts = now();

  getDb().prepare(`
    INSERT OR REPLACE INTO organization_profile
      (id, legal_entity_name, registered_jurisdiction, regulatory_licences,
       in_scope_activities, isms_scope_statement, declared_exclusions,
       raci_roles, review_cadence_months, created_at, updated_at,
       logo_url, primary_color, document_footer, certification_body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
      (SELECT created_at FROM organization_profile WHERE id = ?), ?
    ), ?, ?, ?, ?, ?)
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
    logo_url ?? null,
    primary_color ?? null,
    document_footer ?? null,
    certification_body ?? null,
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
