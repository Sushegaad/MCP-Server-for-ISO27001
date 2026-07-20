/**
 * iso27001-mcp — Health check command
 *
 * Usage: iso27001-mcp doctor
 *
 * Runs 12 checks and prints ✅ / ❌ / -- for each.
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
import { MIGRATIONS }                from "../db/migrations/index.js";

// ── Types ─────────────────────────────────────────────────────

interface CheckResult {
  passed:  boolean;
  skipped: boolean;
}

// ── runDoctor ─────────────────────────────────────────────────

export function runDoctor(
  /** When true, don't call closePrompt() — caller manages it. */
  calledFromInit = false,
): boolean {
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

  // Claude Desktop is only available on macOS and Windows.
  // Declare here so all checks below can use it (Checks 3, 9, 10).
  const isDesktopPlatform = process.platform === "darwin" || process.platform === "win32";

  // ── Check 3: MCP_API_KEY ──────────────────────────────────
  // On Linux there is no Claude Desktop, so MCP_API_KEY is injected via
  // Claude Code / CLAUDE.md env — it will not be in process.env when the
  // doctor runs from a shell.  Skip rather than fail to avoid a misleading ❌.
  if (!isDesktopPlatform) {
    check(
      "MCP_API_KEY",
      false,
      true,
      "skipped (not applicable on Linux — inject via Claude Code env or CLAUDE.md)",
    );
    record(false, true);
  } else {
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
      const expected = MIGRATIONS.length;
      const passed = rows.length >= expected;
      check(
        "Migrations",
        passed,
        false,
        `${rows.length}/${expected} applied${passed ? "" : " — DB may need re-initialisation"}`,
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
  // isDesktopPlatform was declared before Check 3 so all checks share it.
  const configPath = isDesktopPlatform ? findClaudeDesktopConfig() : null;
  {
    if (!isDesktopPlatform) {
      check("Claude Desktop config", false, true, "skipped (not applicable on Linux — use Claude Code)");
      record(false, true);
    } else {
      const passed = configPath !== null;
      check(
        "Claude Desktop config",
        passed,
        false,
        passed ? configPath : "not found — install Claude Desktop or add config manually",
      );
      record(passed);
    }
  }

  const configOk = isDesktopPlatform && configPath !== null;

  // Track whether the iso27001-mcp mcpServers entry is valid (used by Check 12).
  let mcpEntryPresent = false;

  // ── Check 10: iso27001-mcp entry ─────────────────────────
  if (!isDesktopPlatform) {
    check("iso27001-mcp entry", false, true, "skipped (not applicable on Linux — use Claude Code)");
    record(false, true);
  } else if (!configOk) {
    check("iso27001-mcp entry", false, true, "skipped (config not found)");
    record(false, true);
  } else {
    try {
      const raw    = readFileSync(configPath, "utf8");
      const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
      const entry  = config.mcpServers?.["iso27001-mcp"] as
        { command?: string } | undefined;

      let passed = !!entry;
      let detail = passed ? "present in mcpServers" : "missing — run: iso27001-mcp init";

      // Extra validation: if init wrote an absolute command path (the nvm/Volta
      // fix), verify that path still exists on disk.  After a Node version
      // upgrade the path could point to a deleted binary — the entry looks
      // correct but Claude Desktop silently fails to launch the server.
      if (passed && entry?.command) {
        const cmd = entry.command;
        const isAbsPath = cmd.startsWith("/") || /^[A-Za-z]:[/\\]/.test(cmd);
        if (isAbsPath && !existsSync(cmd)) {
          passed = false;
          detail =
            `command path no longer exists: ${cmd}\n` +
            `       → Re-run: iso27001-mcp init  (Node version may have changed)`;
        }
      }

      mcpEntryPresent = passed;
      check("iso27001-mcp entry", passed, false, detail);
      record(passed);
    } catch {
      check("iso27001-mcp entry", false, false, "could not parse claude_desktop_config.json");
      record(false);
    }
  }

  // ── Check 11: Database writable ──────────────────────────────
  // Attempts a PRAGMA user_version round-trip to confirm the DB file is
  // writable.  This catches read-only file permissions without touching any
  // application table.
  if (!dbOk) {
    check("Database writable", false, true, "skipped (database not accessible)");
    record(false, true);
  } else {
    try {
      const db = openDb(dbPath);
      const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
      db.prepare(`PRAGMA user_version = ${user_version}`).run();
      check("Database writable", true, false, "read-write test passed");
      record(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check("Database writable", false, false, `read-write test failed: ${msg}`);
      record(false);
    }
  }

  // ── Check 12: Required env vars in Claude Desktop config ─────
  // Verifies that mcpServers["iso27001-mcp"].env contains all three required
  // secrets so Claude Desktop can inject them when launching the server.
  if (!isDesktopPlatform) {
    check("Env vars in config", false, true, "skipped (not applicable on Linux)");
    record(false, true);
  } else if (!configOk || !mcpEntryPresent) {
    check("Env vars in config", false, true, "skipped (config entry not present)");
    record(false, true);
  } else {
    try {
      const raw    = readFileSync(configPath, "utf8");
      const config = JSON.parse(raw) as {
        mcpServers?: Record<string, { env?: Record<string, string> }>
      };
      const env    = config.mcpServers?.["iso27001-mcp"]?.env ?? {};
      const missing: string[] = [];
      if (!env["DB_ENCRYPTION_KEY"]) missing.push("DB_ENCRYPTION_KEY");
      if (!env["HMAC_SECRET"])       missing.push("HMAC_SECRET");
      if (!env["MCP_API_KEY"])       missing.push("MCP_API_KEY");
      const passed = missing.length === 0;
      check(
        "Env vars in config",
        passed,
        false,
        passed
          ? "DB_ENCRYPTION_KEY, HMAC_SECRET, MCP_API_KEY all present"
          : `missing: ${missing.join(", ")} — re-run: iso27001-mcp init`,
      );
      record(passed);
    } catch {
      check("Env vars in config", false, false, "could not parse claude_desktop_config.json");
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
    // Skips only — either dependent checks (secrets/DB missing) or
    // platform N/A checks (Claude Desktop not available on Linux).
    process.stdout.write(
      `  ${passed} check${passed === 1 ? "" : "s"} passed, ` +
      `${skipped} skipped.\n\n`,
    );
  }

  if (!calledFromInit) {
    closePrompt();
    if (failed > 0) process.exit(1);
  }

  return failed === 0;
}
