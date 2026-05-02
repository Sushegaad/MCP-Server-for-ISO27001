#!/usr/bin/env node
/**
 * iso27001-mcp — CLI entry point.
 *
 * Phase 1 stub: validates required env vars, opens the encrypted
 * database, confirms migrations applied, and exits cleanly.
 * Full MCP transport wiring is added in Phase 4.
 *
 * Usage:
 *   iso27001-mcp --mode local --db ./isms.db
 *   iso27001-mcp keygen --label "Alice" --role analyst
 */

import { openDb, closeDb } from "./db/connection.js";

const args = process.argv.slice(2);
const dbFlag = args.indexOf("--db");
const dbPath = dbFlag !== -1 ? args[dbFlag + 1] : (process.env["DB_PATH"] ?? "./isms.db");

// Minimal env check before opening the DB
if (!process.env["DB_ENCRYPTION_KEY"]) {
  console.error("[iso27001-mcp] ERROR: DB_ENCRYPTION_KEY is not set.");
  console.error("  Copy .env.example to .env and set the required variables.");
  process.exit(1);
}

if (!process.env["HMAC_SECRET"]) {
  console.error("[iso27001-mcp] ERROR: HMAC_SECRET is not set.");
  process.exit(1);
}

try {
  const db = openDb(dbPath);

  // Confirm migrations table exists and both migrations are applied
  const applied = db
    .prepare("SELECT filename FROM _migrations ORDER BY id")
    .all() as { filename: string }[];

  console.error(`[iso27001-mcp] Database ready: ${dbPath}`);
  console.error(`[iso27001-mcp] Applied migrations: ${applied.map((r) => r.filename).join(", ")}`);
  console.error("[iso27001-mcp] Phase 1 complete — server stub running.");

  // Graceful shutdown
  process.on("SIGTERM", () => { closeDb(); process.exit(0); });
  process.on("SIGINT",  () => { closeDb(); process.exit(0); });

  // Phase 4: transport.connect(createServer()) goes here
} catch (err) {
  console.error("[iso27001-mcp] FATAL startup error:", err);
  process.exit(1);
}
