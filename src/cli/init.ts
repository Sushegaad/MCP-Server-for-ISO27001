/**
 * iso27001-mcp — Interactive setup wizard
 *
 * Usage: iso27001-mcp init
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
         manualConfigBlock }                   from "./claude-config.js";
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

async function chooseLocation(
  promptLabel: string,
  defaultPath: string,
): Promise<string> {
  info(`${promptLabel}`);
  info(`  [1] ${defaultPath}  (recommended)`);
  info(`  [2] Current directory`);
  info(`  [3] Custom path`);
  const choice = await ask("Choice", "1");

  switch (choice) {
    case "2": return resolve(process.cwd(), promptLabel.includes("secret") ? ".env" : "isms.db");
    case "3": {
      const custom = await ask("Enter full path");
      return resolve(custom);
    }
    default:  return defaultPath;
  }
}

// ── runInit ───────────────────────────────────────────────────

export async function runInit(): Promise<void> {
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
    ]);

    step(1, TOTAL, "Checking for existing configuration...");
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 2 — Choose secrets file location
    // ────────────────────────────────────────────────────────
    step(2, TOTAL, "Where should secrets be stored?");
    blank();

    const envFilePath = await chooseLocation("secret file location", defaultEnvPath());
    blank();

    // Check for existing .env and ask before overwriting
    if (existsSync(envFilePath)) {
      info(`Found existing file: ${envFilePath}`);
      const overwrite = await confirm("Overwrite it?", false);
      if (!overwrite) {
        info("Cancelled. Run again to choose a different location.");
        closePrompt();
        return;
      }
      blank();
    }

    // ────────────────────────────────────────────────────────
    //  STEP 3 — Choose database location
    // ────────────────────────────────────────────────────────
    step(3, TOTAL, "Where should the database live?");
    blank();

    const dbPath = await chooseLocation("database location", defaultDbPath());
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

    // generateKey() prints the key box itself and returns the raw key
    const apiKey = generateKey("admin-key", "admin", null);

    // Expose to doctor check when called in-process below
    process.env["MCP_API_KEY"] = apiKey;

    info("The key will be written into your Claude Desktop config automatically.");
    blank();

    // ────────────────────────────────────────────────────────
    //  STEP 8 — Close DB before Claude Desktop detection
    //  (avoids holding an open DB handle across the interactive pause)
    // ────────────────────────────────────────────────────────
    closeDb();
    dbWasOpened = false;

    step(8, TOTAL, "Looking for Claude Desktop config...");
    blank();

    const configPath = findClaudeDesktopConfig();

    let configWritten = false;

    if (!configPath) {
      info("Claude Desktop config not found.");
      info("Add the following entry manually under 'mcpServers' in");
      info("claude_desktop_config.json:");
      blank();
      process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath));
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

      const doWrite = await confirm(
        "Add iso27001-mcp to Claude Desktop config?",
        true,
      );

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
          );

          writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
          info("Claude Desktop config updated.");
          configWritten = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          info(`Could not update config automatically: ${msg}`);
          info("Add this entry manually under 'mcpServers':");
          blank();
          process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath));
          process.stdout.write("\n");
        }
      } else {
        info("Skipped. Add this entry manually under 'mcpServers':");
        blank();
        process.stdout.write(manualConfigBlock(dbEncryptionKey, hmacSecret, apiKey, dbPath));
        process.stdout.write("\n");
      }

      blank();
    }

    // ────────────────────────────────────────────────────────
    //  STEP 10 — Health check
    // ────────────────────────────────────────────────────────
    step(10, TOTAL, "Running health check...");
    blank();

    await runDoctor(/* calledFromInit */ true);

    // ────────────────────────────────────────────────────────
    //  STEP 11 — Success summary
    // ────────────────────────────────────────────────────────
    step(11, TOTAL, "Setup complete!");

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
      "  IMPORTANT: Your API key is in your Claude Desktop config.",
      "             Never commit the .env file to git.",
      "",
      "  NEXT STEPS:",
      "    1. Restart Claude Desktop (quit fully, then reopen)",
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
