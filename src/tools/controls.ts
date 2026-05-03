/**
 * iso27001-mcp — Group 1: Control Registry handlers
 *
 * get_control, list_controls, search_controls, get_control_attributes,
 * compare_versions, get_clause_requirement, list_clause_requirements
 *
 * All handlers are read-only; minimum role: viewer.
 */

import { getDb } from "../db/connection.js";
import { fromJson, fromJsonArray } from "../db/dal.js";
import { notFound } from "../types/errors.js";

// ── Shared types ──────────────────────────────────────────────

interface ControlRow {
  id: string;
  control_id: string;
  version: string;
  name: string;
  theme: string;
  description: string;
  guidance: string | null;
  control_type: string;      // JSON array stored as text
  attributes: string | null; // JSON object stored as text
  related_controls: string | null;
  new_in_2022: number;
  iso_clause_refs: string | null;
  created_at: string;
}

interface ClauseRow {
  id: string;
  clause_id: string;
  parent_id: string | null;
  title: string;
  requirement_text: string;
  implementation_notes: string | null;
  related_controls: string | null;
  created_at: string;
}

interface MappingRow {
  id: string;
  v2013_id: string | null;
  v2022_id: string | null;
  mapping_type: string;
  change_summary: string;
  migration_notes: string | null;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

function shapeControl(row: ControlRow, includeGuidance = true): Record<string, unknown> {
  return {
    id:               row.id,
    control_id:       row.control_id,
    version:          row.version,
    name:             row.name,
    theme:            row.theme,
    description:      row.description,
    guidance:         includeGuidance ? (row.guidance ?? null) : undefined,
    control_type:     fromJsonArray<string>(row.control_type),
    new_in_2022:      row.new_in_2022 === 1,
    related_controls: fromJsonArray<string>(row.related_controls),
    iso_clause_refs:  fromJsonArray<string>(row.iso_clause_refs),
    attributes:       row.attributes ? fromJson<Record<string, unknown>>(row.attributes) : null,
  };
}

// ── get_control ───────────────────────────────────────────────

export function handleGetControl(args: Record<string, unknown>): ToolResult {
  const { control_id, version } = args as { control_id: string; version?: string };
  const db = getDb();

  let sql  = "SELECT * FROM controls WHERE control_id = ?";
  const params: unknown[] = [control_id];

  if (version) {
    sql += " AND version = ?";
    params.push(version);
  } else {
    // Default to 2022 when version not specified; fall back to 2013
    sql += " ORDER BY CASE version WHEN '2022' THEN 0 ELSE 1 END LIMIT 1";
  }

  const row = version
    ? (db.prepare(sql).get(...params) as ControlRow | undefined)
    : (db.prepare(sql).get(...params) as ControlRow | undefined);

  if (!row) throw notFound("control", control_id);
  return ok(shapeControl(row, true));
}

// ── list_controls ─────────────────────────────────────────────

export function handleListControls(args: Record<string, unknown>): ToolResult {
  const {
    version, theme, control_type, new_in_2022, cybersecurity_concept,
    include_guidance = false, limit = 50, offset = 0,
  } = args as {
    version?: string; theme?: string; control_type?: string;
    new_in_2022?: boolean; cybersecurity_concept?: string;
    include_guidance?: boolean; limit?: number; offset?: number;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (version)     { conditions.push("version = ?");      params.push(version); }
  if (theme)       { conditions.push("theme = ?");         params.push(theme); }
  if (new_in_2022 !== undefined) {
    conditions.push("new_in_2022 = ?");
    params.push(new_in_2022 ? 1 : 0);
  }
  if (control_type) {
    // control_type column is a JSON array — use json_each to filter
    conditions.push("EXISTS (SELECT 1 FROM json_each(control_type) WHERE value = ?)");
    params.push(control_type);
  }
  if (cybersecurity_concept) {
    // attributes->cybersecurity_concepts is a JSON array inside the attributes JSON object
    conditions.push(
      "EXISTS (SELECT 1 FROM json_each(json_extract(attributes,'$.cybersecurity_concepts')) WHERE value = ?)"
    );
    params.push(cybersecurity_concept);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db = getDb();

  const total = (db.prepare(`SELECT count(*) AS n FROM controls ${where}`).get(...params) as { n: number }).n;
  params.push(limit, offset);

  const rows = db.prepare(
    `SELECT * FROM controls ${where} ORDER BY control_id, version LIMIT ? OFFSET ?`
  ).all(...params) as ControlRow[];

  return ok({
    total,
    limit,
    offset,
    controls: rows.map((r) => shapeControl(r, include_guidance)),
  });
}

// ── search_controls ───────────────────────────────────────────

export function handleSearchControls(args: Record<string, unknown>): ToolResult {
  const { query, version, limit = 10, offset = 0 } = args as {
    query: string; version?: string; limit?: number; offset?: number;
  };

  const db = getDb();

  // Use FTS5 virtual table; bm25() is the ranking function
  let sql = `
    SELECT c.*
    FROM controls c
    JOIN controls_fts fts ON c.id = fts.rowid
    WHERE controls_fts MATCH ?
  `;
  const params: unknown[] = [query];

  if (version) {
    sql += " AND c.version = ?";
    params.push(version);
  }

  sql += " ORDER BY bm25(controls_fts) LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as ControlRow[];
  return ok({ query, count: rows.length, controls: rows.map((r) => shapeControl(r, false)) });
}

// ── get_control_attributes ────────────────────────────────────

export function handleGetControlAttributes(args: Record<string, unknown>): ToolResult {
  const { control_id } = args as { control_id: string };
  const db = getDb();

  const row = db.prepare(
    "SELECT control_id, version, name, attributes FROM controls WHERE control_id = ? AND version = '2022'"
  ).get(control_id) as Pick<ControlRow, "control_id" | "version" | "name" | "attributes"> | undefined;

  if (!row) throw notFound("control", `${control_id} (2022 version)`);

  const attrs = row.attributes ? fromJson<Record<string, unknown>>(row.attributes) : {};
  return ok({
    control_id: row.control_id,
    name:       row.name,
    version:    "2022",
    attributes: attrs ?? {},
  });
}

// ── compare_versions ──────────────────────────────────────────

export function handleCompareVersions(args: Record<string, unknown>): ToolResult {
  const { v2013_id, v2022_id } = args as { v2013_id?: string; v2022_id?: string };
  const db = getDb();

  let mappings: MappingRow[];

  if (v2022_id && v2013_id) {
    mappings = db.prepare(
      "SELECT * FROM control_version_mapping WHERE v2022_id = ? AND v2013_id = ?"
    ).all(v2022_id, v2013_id) as MappingRow[];
  } else if (v2022_id) {
    mappings = db.prepare(
      "SELECT * FROM control_version_mapping WHERE v2022_id = ?"
    ).all(v2022_id) as MappingRow[];
  } else {
    mappings = db.prepare(
      "SELECT * FROM control_version_mapping WHERE v2013_id = ?"
    ).all(v2013_id!) as MappingRow[];
  }

  if (mappings.length === 0) {
    throw notFound("version_mapping", v2022_id ?? v2013_id ?? "");
  }

  // Enrich with control details
  const enrich = (cid: string | null, ver: string): { control_id: string; name: string | null; theme: string | null; description: string | null } | null => {
    if (!cid) return null;
    const c = db.prepare(
      "SELECT control_id, name, theme, description FROM controls WHERE control_id = ? AND version = ?"
    ).get(cid, ver) as Pick<ControlRow, "control_id" | "name" | "theme" | "description"> | undefined;
    return c ?? { control_id: cid, name: null, theme: null, description: null };
  };

  return ok({
    mappings: mappings.map((m) => ({
      ...m,
      v2013_details: enrich(m.v2013_id, "2013"),
      v2022_details: enrich(m.v2022_id, "2022"),
    })),
  });
}

// ── get_clause_requirement ────────────────────────────────────

export function handleGetClauseRequirement(args: Record<string, unknown>): ToolResult {
  const { clause_id, include_sub_clauses = false } = args as {
    clause_id: string; include_sub_clauses?: boolean;
  };
  const db = getDb();

  const row = db.prepare(
    "SELECT * FROM clause_requirements WHERE clause_id = ?"
  ).get(clause_id) as ClauseRow | undefined;

  if (!row) throw notFound("clause_requirement", clause_id);

  const result: Record<string, unknown> = {
    ...row,
    related_controls: fromJsonArray<string>(row.related_controls),
  };

  if (include_sub_clauses) {
    const subs = db.prepare(
      "SELECT * FROM clause_requirements WHERE parent_id = ? ORDER BY clause_id"
    ).all(row.id) as ClauseRow[];
    result["sub_clauses"] = subs.map((s) => ({
      ...s,
      related_controls: fromJsonArray<string>(s.related_controls),
    }));
  }

  return ok(result);
}

// ── list_clause_requirements ──────────────────────────────────

export function handleListClauseRequirements(args: Record<string, unknown>): ToolResult {
  const { parent_id } = args as { parent_id?: string };
  const db = getDb();

  let rows: ClauseRow[];

  if (parent_id) {
    // Find the row UUID for this clause_id, then get children
    const parent = db.prepare(
      "SELECT id FROM clause_requirements WHERE clause_id = ?"
    ).get(parent_id) as { id: string } | undefined;

    if (!parent) throw notFound("clause_requirement", parent_id);

    rows = db.prepare(
      "SELECT * FROM clause_requirements WHERE parent_id = ? ORDER BY clause_id"
    ).all(parent.id) as ClauseRow[];
  } else {
    // Top-level clauses only (parent_id IS NULL)
    rows = db.prepare(
      "SELECT * FROM clause_requirements WHERE parent_id IS NULL ORDER BY clause_id"
    ).all() as ClauseRow[];
  }

  return ok({
    count: rows.length,
    clauses: rows.map((r) => ({
      ...r,
      related_controls: fromJsonArray<string>(r.related_controls),
    })),
  });
}
