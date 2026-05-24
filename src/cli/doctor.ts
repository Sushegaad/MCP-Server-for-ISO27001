/**
 * iso27001-mcp — Health check command
 *
 * Usage: iso27001-mcp doctor
 *
 * Runs 10 checks and prints ✅ / ❌ / -- for each.
 * Exits with code 1 if any check fails, 0 if all pass.
 *
 * Design rules:
 *   • Never calls loadSecrets() — it throws on missing vars and would
 *     prevent the doctor from showing *which* vars are missing.
 *   • Inspects process.env directly for each check.
 *   • Opens the DB only when secrets pass; marks dependent checks as
 *     skipped (--) rather than cascading failures.
 *   • Safe to call from inside runInit() (same process) after closeDb().
 */

import { existsSync, readFileSync } from "node:fs";
import { join }                     from "node:path";
import { homedir }                  from "node:os";
import { check, closePrompt } from "./prompt.js";
import { findClaudeDesktopConfig }   from "./claude-config.js";
import { openDb, closeDb }           from "../db/connection.js";

// ── Types ─────────────────────────────────────────────────────

interface CheckResult {
  passed:  boolean;
  skipped: boolean;
}

// ── runDoctor ─────────────────────────────────────────────────

export async function runDoctor(
  /** When true, don't call closePrompt() — caller manages it. */
  calledFromInit = false,
): Promise<boolean> {
  const results: CheckResult[] = [];
  let dbOpen = false;

  const divider = "─".repeat(52);

  process.stdout.write(`\niso27001-mcp — health check\n${divider}\n`);

  // ── Helper: record result ─────────────────────────────────
  function record(passed: boolean, skipped = false): CheckResult {
    const r = { passed, skipped };
    results.push(r);
    return r;
  }

  // ── Check 1: DB_ENCRYPTION_KEY ────────────────────────────
  {
    const val    = process.env["DB_ENCRYPTION_KEY"] ?? "";
    const passed = /^[0-9a-f]{64}$/.test(val);
    check(
      "DB_ENCRYPTION_KEY",
      passed,
      false,
      passed ? "set (64 hex chars)" : "not set or wrong length — run: iso27001-mcp init",
    );
    record(passed);
  }

  const secretsOk = results[0].passed;

  // ── Check 2: HMAC_SECRET ──────────────────────────────────
  {
    const val    = process.env["HMAC_SECRET"] ?? "";
    const passed = /^[0-9a-f]{64}$/.test(val);
    check(
      "HMAC_SECRET",
      passed,
      false,
      passed ? "set (64 hex chars)" : "not set or wrong length — run: iso27001-mcp init",
    );
    record(passed);
  }

  const secretsOk2 = secretsOk && results[1].passed;

  // ── Check 3: MCP_API_KEY ──────────────────────────────────
  {
    const val    = process.env["MCP_API_KEY"] ?? "";
    const passed = val.startsWith("iso27001_") && val.length > 15;
    check(
      "MCP_API_KEY",
      passed,
      false,
      passed
        ? "set (starts with iso27001_)"
        : "not set — run: iso27001-mcp keygen --label admin --role admin",
    );
    record(passed);
  }

  // ── Check 4: Database file ────────────────────────────────
  const dbPath = process.env["DB_PATH"] ?? join(homedir(), ".iso27001", "isms.db");
  {
    const passed = existsSync(dbPath);
    check(
      "Database file",
      passed,
      false,
      passed ? dbPath : `not found at ${dbPath} — run: iso27001-mcp init`,
    );
    record(passed);
  }

  const dbFileOk = results[3].passed;

  // ── Check 5: Database accessible ─────────────────────────
  if (!secretsOk2 || !dbFileOk) {
    check("Database accessible", false, true, "skipped (secrets or file missing)");
    record(false, true);
  } else {
    try {
      openDb(dbPath);
      dbOpen = true;
      check("Database accessible", true, false, "opened and queried successfully");
      record(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check("Database accessible", false, false, `error: ${msg}`);
      record(false);
    }
  }

  const dbOk = dbOpen;

  // ── Check 6: Migrations ───────────────────────────────────
  if (!dbOk) {
    check("Migrations", false, true, "skipped (database not accessible)");
    record(false, true);
  } else {
    try {
      const rows = openDb(dbPath)
        .prepare("SELECT filename FROM _migrations ORDER BY id")
        .all() as { filename: string }[];
      const passed = rows.length >= 6;
      check(
        "Migrations",
        passed,
        false,
        `${rows.length}/6 applied${passed ? "" : " — DB may need re-initialisation"}`,
      );
      record(passed);
    } catch {
      check("Migrations", false, false, "could not query _migrations table");
      record(false);
    }
  }

  // ── Check 7: Controls seeded ──────────────────────────────
  if (!dbOk) {
    check("Controls seeded", false, true, "skipped (database not accessible)");
    record(false, true);
  } else {
    try {
      const row = openDb(dbPath)
        .prepare("SELECT count(*) as n FROM controls WHERE version='2022'")
        .get() as { n: number };
      const passed = row.n >= 93;
      check(
        "Controls seeded",
        passed,
        false,
        `${row.n} ISO 27001:2022 controls${passed ? "" : " — expected ≥93, run: iso27001-mcp init"}`,
      );
      record(passed);
    } catch {
      check("Controls seeded", false, false, "could not query controls table");
      record(false);
    }
  }

  // ── Check 8: Active API key ───────────────────────────────
  if (!dbOk) {
    check("Active API key", false, true, "skipped (database not accessible)");
    record(false, true);
  } else {
    try {
      const row = openDb(dbPath)
        .prepare(`
          SELECT count(*) as n FROM api_keys
          WHERE revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > datetime('now'))
        `).get() as { n: number };
      const passed = row.n >= 1;
      check(
        "Active API key",
        passed,
        false,
        passed
          ? `${row.n} active key${row.n === 1 ? "" : "s"} found`
          : "no active keys — run: iso27001-mcp keygen --label admin --role admin",
      );
      record(passed);
    } catch {
      check("Active API key", false, false, "could not query api_keys table");
      record(false);
    }
  }

  // ── Check 9: Claude Desktop config ───────────────────────
  const configPath = findClaudeDesktopConfig();
  {
    const passed = configPath !== null;
    check(
      "Claude Desktop config",
      passed,
      false,
      passed ? configPath : "not found — install Claude Desktop or add config manually",
    );
    record(passed);
  }

  const configOk = configPath !== null;

  // ── Check 10: iso27001-mcp entry ─────────────────────────
  if (!configOk) {
    check("iso27001-mcp entry", false, true, "skipped (config not found)");
    record(false, true);
  } else {
    try {
      const raw    = readFileSync(configPath!, "utf8");
      const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
      const passed = !!(config.mcpServers?.["iso27001-mcp"]);
      check(
        "iso27001-mcp entry",
        passed,
        false,
        passed ? "present in mcpServers" : "missing — run: iso27001-mcp init",
      );
      record(passed);
    } catch {
      check("iso27001-mcp entry", false, false, "could not parse claude_desktop_config.json");
      record(false);
    }
  }

  // ── Summary ───────────────────────────────────────────────
  if (dbOpen) {
    closeDb();
  }

  const failed  = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const passed  = results.filter(r => r.passed).length;

  process.stdout.write(`${divider}\n`);

  if (failed === 0 && skipped === 0) {
    process.stdout.write(
      `  All ${passed} checks passed. Restart Claude Desktop if you just ran init.\n\n`,
    );
  } else if (failed > 0) {
    process.stdout.write(
      `  ${failed} check${failed === 1 ? "" : "s"} failed` +
      (skipped > 0 ? `, ${skipped} skipped` : "") +
      `. Run: iso27001-mcp init\n\n`,
    );
  } else {
    process.stdout.write(`  ${skipped} checks skipped due to earlier failures.\n\n`);
  }

  if (!calledFromInit) {
    closePrompt();
    if (failed > 0) process.exit(1);
  }

  return failed === 0;
}
