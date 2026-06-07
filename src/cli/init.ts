/**
 * iso27001-mcp — Interactive setup wizard
 *
 * Usage:
 *   iso27001-mcp init          — interactive (prompts for all choices)
 *   iso27001-mcp init --yes    — non-interactive (all defaults, no prompts)
 *   iso27001-mcp init -y       — alias for --yes
 *
 * Replaces the manual 5-step setup (openssl → .env → keygen → JSON edit)
 * with a single guided command. No openssl required.
 *
 * Steps:
 *   1  Welcome + existing config check
 *   2  Choose secrets file location
 *   3  Choose database location
 *   4  Generate secrets (DB_ENCRYPTION_KEY, HMAC_SECRET)
 *   5  Write .env file (mode 600)
 *   6  Initialise database + seed controls
 *   7  Generate admin API key
 *   8  Detect Claude Desktop config
 *   9  Write Claude Desktop config entry
 *   10 Run health check (doctor)
 *   11 Print success summary
 *
 * Critical design constraint:
 *   After writing the .env in step 5, secrets are assigned directly to
 *   process.env so that openDb() and generateKey() (which call requireEnv())
 *   work without loading the file from disk. No dotenv dependency.
 *
 * --yes / -y flag:
 *   Accepts all defaults without prompting — ideal for scripted or CI
 *   first-time setups. Safety gate: if an existing database is detected,
 *   --yes aborts rather than risking silent data loss.
 */

import { randomBytes }                        from "node:crypto";
import { existsSync, mkdirSync,
         writeFileSync, chmodSync,
         readFileSync }                        from "node:fs";
import { homedir }                             from "node:os";
import { join, dirname, resolve }              from "node:path";

import { ask, confirm, banner, step,
         blank, info, closePrompt }            from "./prompt.js";
import { findClaudeDesktopConfig,
         buildMcpEntry,
         manualConfigBlock,
         normPath }                            from "./claude-config.js";
import { runDoctor }                           from "./doctor.js";
import { openDb, closeDb }                     from "../db/connection.js";
import { seedAll }                             from "../seed/seeder.js";
import { generateKey }                         from "../auth/api-key.js";

// ── Helpers ───────────────────────────────────────────────────

function defaultEnvPath(): string {
  return join(homedir(), ".iso27001", ".env");
}

function defaultDbPath(): string {
  return join(homedir(), ".iso27001", "isms.db");
}

/**
 * Ask the user where to store a file.
 * In --yes mode, silently accepts the default without prompting.
 */
async function chooseLocation(
  promptLabel: string,
  defaultPath: string,
  useDefaults: boolean,
): Promise<string> {
  if (useDefaults) {
    info(`${promptLabel}: ${defaultPath}  (default)`);
    return defaultPath;
  }

  info(`${promptLabel}`);
  info(`  [1] ${defaultPath}  (recommended)`);
  info(`  [2] Current directory`);
  info(`  [3] Custom path`);
  const choice = await ask("Choice", "1");

  switch (choice) {
    case "2": return resolve(process.cwd(), promptLabel.toLowerCase().includes("secret") ? ".env" : "isms.db");
    case "3": {
      const custom = await ask("Enter full path");
      // Expand leading ~ so users can type paths like ~/my/isms without
      // resolve() treating ~ as a literal directory name under cwd.
      return resolve(custom.replace(/^~(?=[/\\]|$)/, homedir()));
    }
    default:  return defaultPath;
  }
}

// ── runInit ───────────────────────────────────────────────────

/**
 * @param useDefaults  When true (--yes / -y flag), all prompts are skipped
 *                     and default values are used. Aborts if an existing
 *                     database is found to prevent accidental data loss.
 */
export async function runInit(useDefaults = false): Promise<void> {
  const TOTAL = 11;
  let   dbWasOpened = false;

  try {
    // ────────────────────────────────────────────────────────
    //  STEP 1 — Welcome + existing config detection
    // ────────────────────────────────────────────────────────
    banner([
      "iso27001-mcp setup wizard",
      "",
      "Turn Claude into an ISO 27001 compliance assistant in minutes.",
      "No openssl required.  Ctrl-C to cancel at any time.",
      ...(useDefaults ? ["", "  Mode: --yes (all defaults accepted, no prompts)"] : []),
    ]);

    step(1, TOTAL, "Checking for existing configuration...");
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 2 — Choose secrets file location
    // ────────────────────────────────────────────────────────
    step(2, TOTAL, "Secrets file location");
    blank();

    const envFilePath = await chooseLocation("Secrets file", defaultEnvPath(), useDefaults);
    blank();

    // Check for existing .env and ask before overwriting.
    if (existsSync(envFilePath)) {
      info(`Found existing file: ${envFilePath}`);

      // Try to identify the associated database for a more informative warning.
      let existingDbPath: string | null = null;
      try {
        const existing = readFileSync(envFilePath, "utf8");
        const dbMatch  = existing.match(/^DB_PATH=(.+)$/m);
        if (dbMatch) existingDbPath = dbMatch[1].trim();
      } catch { /* ignore read errors — proceed to overwrite prompt */ }

      // Show a loud warning regardless of whether the DB file still exists.
      // The .env alone contains live encryption secrets; any existing DB
      // encrypted with those secrets becomes inaccessible if secrets change.
      banner([
        "⚠  WARNING — EXISTING INSTALLATION DETECTED",
        "",
        `  Secrets file : ${envFilePath}`,
        ...(existingDbPath ? [`  Database     : ${existingDbPath}`] : []),
        "",
        "  Regenerating secrets will PERMANENTLY LOCK YOU OUT of",
        "  your existing ISMS data.  All existing API keys will",
        "  stop working.  This cannot be undone.",
        "",
        "  Run 'iso27001-mcp doctor' to verify your current setup",
        "  before proceeding.",
      ]);

      if (useDefaults) {
        // --yes safety gate: never silently destroy an existing installation.
        // Require explicit interactive confirmation when secrets already exist.
        info("Aborting (--yes safety gate): existing secrets file detected.");
        info("Run 'iso27001-mcp init' without --yes to confirm overwrite.");
        closePrompt();
        return;
      }

      const overwrite = await confirm("Overwrite existing secrets? (this cannot be undone)", false);
      if (!overwrite) {
        info("Cancelled. Existing installation preserved.");
        info("Run: iso27001-mcp doctor  — to verify your current setup.");
        closePrompt();
        return;
      }
      blank();
    }

    // ────────────────────────────────────────────────────────
    //  STEP 3 — Choose database location
    // ────────────────────────────────────────────────────────
    step(3, TOTAL, "Database location");
    blank();

    const dbPath = await chooseLocation("Database file", defaultDbPath(), useDefaults);
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 4 — Generate secrets
    // ────────────────────────────────────────────────────────
    step(4, TOTAL, "Generating secrets...");

    const dbEncryptionKey = randomBytes(32).toString("hex");  // 64 hex chars
    const hmacSecret      = randomBytes(32).toString("hex");  // 64 hex chars

    info("Generated DB_ENCRYPTION_KEY  (64 hex chars, AES-256)");
    info("Generated HMAC_SECRET        (64 hex chars, HMAC-SHA256)");
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 5 — Write .env file
    // ────────────────────────────────────────────────────────
    step(5, TOTAL, `Writing ${envFilePath}  (mode 600)...`);

    const auditLogPath = join(dirname(dbPath), "audit.jsonl");
    const envContent   = [
      `# iso27001-mcp — generated by 'iso27001-mcp init' on ${new Date().toISOString()}`,
      `# WARNING: Contains encryption secrets. Do NOT commit this file to git.`,
      ``,
      `DB_ENCRYPTION_KEY=${dbEncryptionKey}`,
      `HMAC_SECRET=${hmacSecret}`,
      `DB_PATH=${dbPath}`,
      `AUDIT_LOG_PATH=${auditLogPath}`,
      ``,
    ].join("\n");

    mkdirSync(dirname(envFilePath), { recursive: true });
    writeFileSync(envFilePath, envContent, { encoding: "utf8" });

    // chmod 600 — owner read/write only.  Silently ignored on Windows.
    try { chmodSync(envFilePath, 0o600); } catch { /* Windows */ }

    info("Written.");

    // Write a pointer file at ~/.iso27001/.env-location so that
    // loadDotEnvFile() can find this .env from any working directory,
    // even when the user chose a non-default location.
    try {
      const ptrDir = join(homedir(), ".iso27001");
      mkdirSync(ptrDir, { recursive: true });
      writeFileSync(join(ptrDir, ".env-location"), envFilePath, { encoding: "utf8" });
    } catch { /* non-critical — env-loader falls back to cwd search */ }

    blank();

    // ── Assign secrets to process.env so openDb() / generateKey() work ──
    process.env["DB_ENCRYPTION_KEY"] = dbEncryptionKey;
    process.env["HMAC_SECRET"]       = hmacSecret;
    process.env["DB_PATH"]           = dbPath;

    // ────────────────────────────────────────────────────────
    //  STEP 6 — Initialise database
    // ────────────────────────────────────────────────────────
    step(6, TOTAL, `Initialising database at ${dbPath}`);

    mkdirSync(dirname(dbPath), { recursive: true });

    const db = openDb(dbPath);
    dbWasOpened = true;

    // seedAll is idempotent — safe to call on an existing DB
    seedAll(db);

    // Report what was applied
    const migrations = db
      .prepare("SELECT filename FROM _migrations ORDER BY id")
      .all() as { filename: string }[];
    const controlCount = (
      db.prepare("SELECT count(*) as n FROM controls WHERE version='2022'")
        .get() as { n: number }
    ).n;

    info(`Applied ${migrations.length} migrations`);
    info(`Loaded ${controlCount} ISO 27001:2022 controls`);
    info(`Database ready.`);
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 7 — Generate admin API key
    // ────────────────────────────────────────────────────────
    step(7, TOTAL, "Generating admin API key...");
    blank();

    // Reassure the user BEFORE the key box appears so the "save now" message
    // in generateKey() is not alarming — the key is written to config automatically.
    info("Generating admin API key...");
    info("The key will be written into your Claude Desktop config automatically.");
    info("You do not need to copy or store it separately.");
    blank();

    // generateKey() prints the key box itself and returns the raw key
    const apiKey = generateKey("admin-key", "admin", null);

    // Expose to doctor check when called in-process below
    process.env["MCP_API_KEY"] = apiKey;
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 8 — Close DB before Claude Desktop detection
    //  (avoids holding an open DB handle across the interactive pause)
    // ────────────────────────────────────────────────────────
    closeDb();
    dbWasOpened = false;

    step(8, TOTAL, "Looking for Claude Desktop config...");
    blank();

    // Capture absolute bin paths now, while we know them from process context.
    // Claude Desktop is a GUI app and does not source shell startup files
    // (.zshrc, .bashrc), so "iso27001-mcp" may not be on its PATH even when
    // it resolves fine in a terminal.  Using absolute paths bypasses PATH
    // entirely — critical for nvm / Volta / Homebrew Node users on macOS.
    const resolvedBin = (process.argv[1])
      ? { node: normPath(process.execPath), script: normPath(process.argv[1]) }
      : undefined;

    const configPath = findClaudeDesktopConfig();

    let configWritten = false;

    if (!configPath) {
      // ── FIX 6: guide the user to install Claude Desktop if not found ──
      info("Claude Desktop config not found.");
      blank();
      info("  Haven't installed Claude Desktop yet?");
      info("  → Download: https://claude.ai/download");
      info("  Once installed, run 'iso27001-mcp init' again to configure");
      info("  automatically — your database and API key will be preserved.");
      blank();
      info("  Or add the entry manually under 'mcpServers' in");
      info("  claude_desktop_config.json:");
      blank();
      process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath, auditLogPath));
      process.stdout.write("\n\n");
    } else {
      info(`Found: ${configPath}`);

      // Show existing mcpServers keys
      try {
        const existing = JSON.parse(readFileSync(configPath, "utf8")) as
          { mcpServers?: Record<string, unknown> };
        const existingKeys = Object.keys(existing.mcpServers ?? {});
        if (existingKeys.length > 0) {
          info(`Existing mcpServers: [${existingKeys.join(", ")}]`);
        }
      } catch { /* ignore parse errors here — handled in step 9 */ }

      blank();

      // ────────────────────────────────────────────────────────
      //  STEP 9 — Write Claude Desktop config
      // ────────────────────────────────────────────────────────
      step(9, TOTAL, "Update Claude Desktop config?");
      blank();

      // In --yes mode, auto-accept writing the config (same as pressing Enter
      // at the default-yes prompt).
      const doWrite = useDefaults
        ? true
        : await confirm("Add iso27001-mcp to Claude Desktop config?", true);

      if (doWrite) {
        try {
          let config: { mcpServers?: Record<string, unknown> } = {};

          const raw = readFileSync(configPath, "utf8").trim();
          if (raw.length > 0) {
            config = JSON.parse(raw) as typeof config;
          }

          config.mcpServers = config.mcpServers ?? {};
          config.mcpServers["iso27001-mcp"] = buildMcpEntry(
            dbEncryptionKey,
            hmacSecret,
            apiKey,
            dbPath,
            auditLogPath,
            resolvedBin,  // absolute node + script paths — avoids PATH issues
          );

          writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
          info("Claude Desktop config updated.");
          configWritten = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          info(`Could not update config automatically: ${msg}`);
          info("Add this entry manually under 'mcpServers':");
          blank();
          info("  ⚠  nvm / Volta users: replace \"iso27001-mcp\" with the absolute path:");
          info("     macOS/Linux:  $(which iso27001-mcp)");
          info("     Windows:      result of: where iso27001-mcp");
          blank();
          process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath, auditLogPath));
          process.stdout.write("\n");
        }
      } else {
        info("Skipped. Add this entry manually under 'mcpServers':");
        blank();
        info("  ⚠  nvm / Volta users: replace \"iso27001-mcp\" with the absolute path:");
        info("     macOS/Linux:  $(which iso27001-mcp)");
        info("     Windows:      result of: where iso27001-mcp");
        blank();
        process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath, auditLogPath));
        process.stdout.write("\n");
      }

      blank();
    }

    // ────────────────────────────────────────────────────────
    //  STEP 10 — Health check
    // ────────────────────────────────────────────────────────
    step(10, TOTAL, "Running health check...");
    blank();

    runDoctor(/* calledFromInit */ true);

    // ────────────────────────────────────────────────────────
    //  STEP 11 — Success summary
    // ────────────────────────────────────────────────────────
    step(11, TOTAL, "Setup complete!");

    // ── FIX 4: platform-specific quit instructions ──
    const restartInstructions = process.platform === "win32"
      ? "       Windows — right-click the taskbar icon → Quit"
      : process.platform === "darwin"
        ? "       macOS — press Cmd+Q (red dot only closes the window)"
        : "       Restart your Claude client or MCP host";

    banner([
      "Setup complete!",
      "",
      `  Secrets file : ${envFilePath}  (mode 600)`,
      `  Database     : ${dbPath}`,
      `  API key      : admin-key  (role: admin, no expiry)`,
      configWritten
        ? `  Claude config: ${configPath}`
        : `  Claude config: add manually (see JSON block above)`,
      "",
      "  IMPORTANT: Your API key is in your Claude Desktop config under",
      `             mcpServers → iso27001-mcp → env → MCP_API_KEY.`,
      "             Never commit the .env file to git.",
      "",
      "  NEXT STEPS:",
      "    1. Restart Claude Desktop fully:",
      restartInstructions,
      "    2. Ask Claude: \"Use get_server_info to verify the server is running\"",
      "    3. Try: \"Run an ISO 27001 gap assessment for a 50-person SaaS company\"",
      "",
      "  Generate more keys:  iso27001-mcp keygen --label alice --role analyst",
      "  Health check:        iso27001-mcp doctor",
    ]);

  } catch (err) {
    if (dbWasOpened) closeDb();
    closePrompt();
    console.error("\n[init] Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  closePrompt();
}
