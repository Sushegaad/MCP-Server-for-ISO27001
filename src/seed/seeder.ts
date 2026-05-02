/**
 * iso27001-mcp — Seed Runner
 *
 * seedAll(db) inserts all reference data into the database:
 *   • 93  ISO 27001:2022 Annex A controls
 *   • 114 ISO 27001:2013 Annex A controls
 *   • 125 version-mapping rows
 *   •  41 clause requirement rows (clauses 4–10 + sub-clauses)
 *
 * The function is fully idempotent — it detects existing data and
 * returns early without re-inserting. Checksums of the JSON source
 * files are verified before every insert run to detect corruption.
 *
 * Call order: openDb() → runMigrations() → seedAll()
 */

import { createHash, randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

// ── Seed data imports (bundled by tsup at build time) ─────────
import controls2022Raw from "./controls-2022.json";
import controls2013Raw from "./controls-2013.json";
import versionMappingRaw from "./version-mapping.json";
import clauseRaw from "./clause-requirements.json";
import expectedChecksums from "./checksums.json";

// ── Types ─────────────────────────────────────────────────────

interface Control2022 {
  control_id: string;
  version: "2022";
  name: string;
  theme: string;
  description: string;
  guidance?: string;
  control_type: string[];
  attributes?: Record<string, string[]>;
  related_controls?: string[];
  new_in_2022: boolean;
  iso_clause_refs?: string[];
}

interface Control2013 {
  control_id: string;
  version: "2013";
  name: string;
  theme: string;
  description: string;
  guidance?: string;
  control_type: string[];
  related_controls?: string[];
  new_in_2022: boolean;
  iso_clause_refs?: string[];
}

interface VersionMapping {
  v2013_id: string | null;
  v2022_id: string | null;
  mapping_type: "direct" | "split" | "merged" | "renamed" | "new_2022" | "removed_2022";
  change_summary: string;
  migration_notes?: string;
}

interface ClauseRequirement {
  clause_id: string;
  parent_id: string | null;
  title: string;
  requirement_text: string;
  implementation_notes?: string;
  related_controls?: string[];
}

// ── Checksum helper ───────────────────────────────────────────

/**
 * Compute the canonical SHA-256 checksum of a seed dataset.
 * The dataset is serialised with JSON.stringify(data, null, 2)
 * to match what generate-checksums.ts produces.
 */
function sha256(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data, null, 2))
    .digest("hex");
}

/** Verify all seed file checksums. Throws on mismatch. */
function verifyChecksums(): void {
  const checks: Array<{ key: keyof typeof expectedChecksums; data: unknown }> = [
    { key: "controls-2022.json",    data: controls2022Raw },
    { key: "controls-2013.json",    data: controls2013Raw },
    { key: "version-mapping.json",  data: versionMappingRaw },
    { key: "clause-requirements.json", data: clauseRaw },
  ];

  for (const { key, data } of checks) {
    const actual   = sha256(data);
    const expected = expectedChecksums[key];
    if (!expected) {
      throw new Error(
        `[seeder] No checksum entry found for "${key}". ` +
        `Run "npm run generate-checksums" to regenerate checksums.json.`,
      );
    }
    if (actual !== expected) {
      throw new Error(
        `[seeder] Checksum mismatch for "${key}".\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `Seed data may have been modified. ` +
        `Run "npm run generate-checksums" to update checksums.json.`,
      );
    }
  }
  console.error("[seeder] Checksum verification passed.");
}

// ── Deterministic ID helper ───────────────────────────────────

/**
 * Generate a stable UUID from a natural key string.
 * Format: SHA-256 of the key, formatted as a UUID v4-shaped string.
 * Ensures INSERT OR IGNORE is truly idempotent across seeder runs.
 */
function stableId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// ── Main seedAll function ─────────────────────────────────────

/**
 * Seed all reference data into the database.
 *
 * @param db - An open BetterSqlite3 database with migrations applied.
 */
export function seedAll(db: BetterSqlite3.Database): void {
  // Always verify checksums — catches tampered JSON before any DB write.
  verifyChecksums();

  // Idempotency guard — check if controls are already present.
  const existing = db.prepare("SELECT count(*) AS n FROM controls").get() as { n: number };
  if (existing.n > 0) {
    console.error(`[seeder] Seed data already present (${existing.n} controls). Skipping.`);
    return;
  }

  console.error("[seeder] Starting seed run…");
  const t0 = Date.now();

  const seed = db.transaction(() => {
    _seedControls2022(db);
    _seedControls2013(db);
    _seedVersionMappings(db);
    _seedClauseRequirements(db);
    _rebuildFts(db);
  });

  seed();

  const elapsed = Date.now() - t0;
  const totals = db
    .prepare(`
      SELECT
        (SELECT count(*) FROM controls WHERE version='2022')           AS c2022,
        (SELECT count(*) FROM controls WHERE version='2013')           AS c2013,
        (SELECT count(*) FROM controls WHERE new_in_2022=1)            AS new22,
        (SELECT count(*) FROM control_version_mapping)                 AS mappings,
        (SELECT count(*) FROM clause_requirements)                     AS clauses
    `)
    .get() as { c2022: number; c2013: number; new22: number; mappings: number; clauses: number };

  console.error(
    `[seeder] Done in ${elapsed}ms — ` +
    `controls-2022: ${totals.c2022}, controls-2013: ${totals.c2013}, ` +
    `new-in-2022: ${totals.new22}, mappings: ${totals.mappings}, clauses: ${totals.clauses}`,
  );
}

// ── Private seed helpers ──────────────────────────────────────

function _seedControls2022(db: BetterSqlite3.Database): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO controls
      (id, control_id, version, name, theme, description, guidance,
       control_type, attributes, related_controls, new_in_2022, iso_clause_refs)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of controls2022Raw as Control2022[]) {
    stmt.run(
      stableId(`2022:${row.control_id}`),
      row.control_id,
      "2022",
      row.name,
      row.theme,
      row.description,
      row.guidance ?? null,
      JSON.stringify(row.control_type),
      row.attributes ? JSON.stringify(row.attributes) : null,
      JSON.stringify(row.related_controls ?? []),
      row.new_in_2022 ? 1 : 0,
      JSON.stringify(row.iso_clause_refs ?? []),
    );
  }
  console.error(`[seeder]   Inserted ${controls2022Raw.length} 2022 controls.`);
}

function _seedControls2013(db: BetterSqlite3.Database): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO controls
      (id, control_id, version, name, theme, description, guidance,
       control_type, attributes, related_controls, new_in_2022, iso_clause_refs)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of controls2013Raw as Control2013[]) {
    stmt.run(
      stableId(`2013:${row.control_id}`),
      row.control_id,
      "2013",
      row.name,
      row.theme,
      row.description,
      row.guidance ?? null,
      JSON.stringify(row.control_type),
      null,  // 2013 controls have no 2022-style attributes
      JSON.stringify(row.related_controls ?? []),
      0,     // new_in_2022 is always false for 2013 controls
      JSON.stringify(row.iso_clause_refs ?? []),
    );
  }
  console.error(`[seeder]   Inserted ${controls2013Raw.length} 2013 controls.`);
}

function _seedVersionMappings(db: BetterSqlite3.Database): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO control_version_mapping
      (id, v2013_id, v2022_id, mapping_type, change_summary, migration_notes)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `);

  for (const row of versionMappingRaw as VersionMapping[]) {
    const naturalKey = `mapping:${row.v2013_id ?? "null"}:${row.v2022_id ?? "null"}:${row.mapping_type}`;
    stmt.run(
      stableId(naturalKey),
      row.v2013_id ?? null,
      row.v2022_id ?? null,
      row.mapping_type,
      row.change_summary,
      row.migration_notes ?? null,
    );
  }
  console.error(`[seeder]   Inserted ${versionMappingRaw.length} version mappings.`);
}

function _seedClauseRequirements(db: BetterSqlite3.Database): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO clause_requirements
      (id, clause_id, parent_id, title, requirement_text,
       implementation_notes, related_controls)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `);

  // Build clause_id → row UUID map for parent_id resolution.
  // Top-level clauses (parent_id = null) must be inserted first.
  const clauses = clauseRaw as ClauseRequirement[];
  const idMap = new Map<string, string>();

  for (const row of clauses) {
    idMap.set(row.clause_id, stableId(`clause:${row.clause_id}`));
  }

  // Sort: top-level rows first (parent_id === null), then sub-clauses.
  // Within each level, sort by clause_id to ensure consistent ordering.
  const sorted = [...clauses].sort((a, b) => {
    if (a.parent_id === null && b.parent_id !== null) return -1;
    if (a.parent_id !== null && b.parent_id === null) return 1;
    return a.clause_id.localeCompare(b.clause_id);
  });

  for (const row of sorted) {
    const rowId     = idMap.get(row.clause_id)!;
    const parentDbId = row.parent_id ? (idMap.get(row.parent_id) ?? null) : null;

    stmt.run(
      rowId,
      row.clause_id,
      parentDbId,
      row.title,
      row.requirement_text,
      row.implementation_notes ?? null,
      JSON.stringify(row.related_controls ?? []),
    );
  }
  console.error(`[seeder]   Inserted ${clauses.length} clause requirements.`);
}

/**
 * Populate the FTS5 content table from the controls table.
 * Must be called after all controls have been inserted.
 */
function _rebuildFts(db: BetterSqlite3.Database): void {
  db.prepare("INSERT INTO controls_fts(controls_fts) VALUES('rebuild')").run();
  console.error("[seeder]   FTS5 index rebuilt.");
}

// ── Exported helper: generate a fresh UUID for application use ─

export { randomUUID as newSeedId };
