import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { MIGRATIONS } from "./migrations/index.js";
import { requireEnv as _requireEnv } from "../security/secrets.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3-multiple-ciphers") as typeof BetterSqlite3;

type Db = BetterSqlite3.Database;

// Module-level singleton — one DB connection per process.
let _db: Db | null = null;
const _startTime = Date.now();

/**
 * Open (or return the existing) encrypted SQLite database.
 * Sets all required pragmas, runs pending migrations, and performs
 * a smoke-test read to confirm the encryption key is correct.
 */
export function openDb(dbPath: string): Db {
  if (_db) return _db;

  const key = requireEnv("DB_ENCRYPTION_KEY");
  const db = new Database(dbPath) as Db;

  // Encryption key — must be set before any other operation.
  // Uses SQLite3MultipleCiphers default cipher: sqleet (AES-256-GCM).
  // Single-quoted string is required by the SQLite3MC pragma parser.
  db.pragma(`key='${key}'`);

  // Performance and correctness pragmas
  db.pragma("journal_mode=WAL");
  db.pragma("foreign_keys=ON");
  db.pragma("synchronous=NORMAL");

  // Smoke test — throws immediately if the encryption key is wrong
  db.prepare("SELECT count(*) FROM sqlite_master").get();

  runMigrations(db);

  _db = db;
  return db;
}

/** Return the open database instance. Throws if openDb() was not called first. */
export function getDb(): Db {
  if (!_db) {
    throw new Error(
      "Database not initialised. Call openDb() before accessing the database.",
    );
  }
  return _db;
}

/** Close the database and clear the singleton. Safe to call multiple times. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Seconds since the database was first opened (used by get_server_info). */
export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - _startTime) / 1000);
}

// ── Migration Runner ─────────────────────────────────────────

/**
 * Apply all pending migrations in a single atomic transaction.
 * Already-applied migrations are skipped. Fails fast — if any
 * migration throws, the entire transaction rolls back and the
 * process exits with code 1 (a partial schema is never possible).
 */
function runMigrations(db: Db): void {
  // Bootstrap: create _migrations table before any app migrations run
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      checksum    TEXT    NOT NULL
    )
  `);

  // Load which migrations have already been applied
  const applied = new Set<string>(
    (db.prepare("SELECT filename FROM _migrations ORDER BY id").all() as {
      filename: string;
    }[]).map((r) => r.filename),
  );

  // Run pending migrations in order — all in one transaction
  const applyPending = db.transaction(() => {
    for (const { filename, sql } of MIGRATIONS) {
      if (applied.has(filename)) continue;

      const checksum = createHash("sha256").update(sql).digest("hex");
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (filename, checksum) VALUES (?, ?)").run(
        filename,
        checksum,
      );

      console.error(`[migration] Applied: ${filename}`);
    }
  });

  try {
    applyPending();
  } catch (err) {
    console.error("[migration] FATAL: migration failed — database left unchanged.", err);
    process.exit(1);
  }
}

// ── Utility ──────────────────────────────────────────────────

/**
 * Read a required environment variable.
 * Re-exported from security/secrets.ts for backwards compatibility.
 */
export const requireEnv = _requireEnv;
