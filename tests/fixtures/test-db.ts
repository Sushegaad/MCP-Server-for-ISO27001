/**
 * iso27001-mcp — Test DB fixture
 *
 * Creates an in-memory SQLite database for integration tests.
 * We guard all usage behind supportsNativeDb so tests can skip gracefully
 * in CI environments where the native better-sqlite3-multiple-ciphers
 * binary is not available or fails to load.
 */

export let supportsNativeDb = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseClass: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseClass = require("better-sqlite3-multiple-ciphers");
  // Probe: actually open an in-memory DB to confirm the native binding works.
  // require() alone succeeds on Linux but the .node binary can still fail at runtime.
  const probe = new DatabaseClass(":memory:");
  probe.close();
  supportsNativeDb = true;
} catch {
  supportsNativeDb = false;
}

// ── Lazy imports of migration SQL and seeder ──────────────────
// We import these at module level (not inside the function) so TypeScript
// can resolve them; if the native module is missing we never call createTestDb.

import { MIGRATIONS } from "../../src/db/migrations/index.js";
import { seedAll } from "../../src/seed/seeder.js";

// ── Public API ────────────────────────────────────────────────

/**
 * Open a fresh in-memory SQLite database, run both migrations,
 * and seed all reference data via seedAll().
 *
 * @throws If the native SQLite module is not available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTestDb(): any {
  if (!supportsNativeDb) {
    throw new Error(
      "Native SQLite module not available — cannot create test DB.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const db = new DatabaseClass(":memory:");

  // Bootstrap migrations tracking table (mirrors connection.ts logic)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      checksum    TEXT    NOT NULL
    )
  `);

  // Apply all migrations in order
  for (const { filename, sql } of MIGRATIONS) {
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (filename, checksum) VALUES (?, ?)").run(
      filename,
      filename, // use filename as placeholder checksum — tests don't verify it
    );
  }

  // Seed all ISO 27001 reference data
  seedAll(db);

  return db;
}

/**
 * Close a test database instance, swallowing any errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function closeTestDb(db: any): void {
  try {
    db.close();
  } catch {
    /* ignore — already closed or never opened */
  }
}
