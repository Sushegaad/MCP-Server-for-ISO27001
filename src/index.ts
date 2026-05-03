#!/usr/bin/env node
/**
 * iso27001-mcp — CLI entry point
 *
 * Usage:
 *   iso27001-mcp [--mode local|team|ci|hosted] [--db <path>]
 *   iso27001-mcp keygen  --label <label> --role viewer|analyst|admin [--expires 90d|1y|YYYY-MM-DD]
 *   iso27001-mcp keys    list
 *   iso27001-mcp keys    revoke --label <label>
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startSseServer } from "./transport/sse.js";
import { loadSecrets } from "./security/secrets.js";
import { openDb, closeDb } from "./db/connection.js";
import { seedAll } from "./seed/seeder.js";
import { createServer } from "./server.js";
import {
  generateKey,
  listKeys,
  revokeKey,
  warnAdminExpiry,
  parseExpiresFlag,
} from "./auth/api-key.js";
import type { Role } from "./auth/api-key.js";

// ── Parse argv ────────────────────────────────────────────────

const args = process.argv.slice(2);

function argValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const subCommand = args[0];  // "keygen" | "keys" | undefined
const dbPath = argValue("--db") ?? process.env["DB_PATH"] ?? "./isms.db";

// ── Graceful shutdown ─────────────────────────────────────────

function shutdown(): void {
  closeDb();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

// ── Sub-commands ──────────────────────────────────────────────

if (subCommand === "keygen") {
  // iso27001-mcp keygen --label "Alice" --role analyst --expires 90d
  handleKeygen();
} else if (subCommand === "keys") {
  handleKeys();
} else {
  // Default: start the server (async — catch top-level rejections)
  startServer().catch((err) => {
    console.error("[iso27001-mcp] FATAL:", err);
    process.exit(1);
  });
}

// ── keygen ────────────────────────────────────────────────────

function handleKeygen(): void {
  const label   = argValue("--label");
  const roleStr = argValue("--role");
  const expires = argValue("--expires");

  if (!label) {
    console.error("[keygen] ERROR: --label is required");
    console.error("  Usage: iso27001-mcp keygen --label <label> --role viewer|analyst|admin [--expires 90d]");
    process.exit(1);
  }

  if (!roleStr || !["viewer", "analyst", "admin"].includes(roleStr)) {
    console.error("[keygen] ERROR: --role must be viewer, analyst, or admin");
    process.exit(1);
  }

  let expiresAt: string | null = null;
  if (expires) {
    try {
      expiresAt = parseExpiresFlag(expires);
    } catch (err) {
      console.error("[keygen] ERROR:", (err as Error).message);
      process.exit(1);
    }
  }

  try {
    loadSecrets();
    const db = openDb(dbPath);
    seedAll(db);
    generateKey(label, roleStr as Role, expiresAt);
    closeDb();
  } catch (err) {
    console.error("[keygen] FATAL:", err);
    process.exit(1);
  }
}

// ── keys ──────────────────────────────────────────────────────

function handleKeys(): void {
  const action = args[1]; // "list" | "revoke"

  if (action === "list") {
    try {
      loadSecrets();
      const db = openDb(dbPath);
      seedAll(db);
      const keys = listKeys();
      /* eslint-disable no-console */
      if (keys.length === 0) {
        console.log("No API keys found. Run: iso27001-mcp keygen --label <label> --role <role>");
      } else {
        console.log(`\n${"Label".padEnd(30)} ${"Role".padEnd(10)} ${"Status".padEnd(10)} ${"Expires".padEnd(12)} Last used`);
        console.log("-".repeat(90));
        for (const k of keys) {
          console.log(
            k.label.padEnd(30) +
            k.role.padEnd(10) +
            k.status.padEnd(10) +
            (k.expires_at ?? "never").padEnd(12) +
            (k.last_used_at ?? "—"),
          );
        }
        console.log("");
      }
      /* eslint-enable no-console */
      closeDb();
    } catch (err) {
      console.error("[keys list] FATAL:", err);
      process.exit(1);
    }

  } else if (action === "revoke") {
    const label = argValue("--label");
    if (!label) {
      console.error("[keys revoke] ERROR: --label is required");
      process.exit(1);
    }
    try {
      loadSecrets();
      const db = openDb(dbPath);
      seedAll(db);
      revokeKey(label);
      // eslint-disable-next-line no-console
      console.log(`[keys] Key '${label}' revoked successfully.`);
      closeDb();
    } catch (err) {
      console.error("[keys revoke] FATAL:", err);
      process.exit(1);
    }

  } else {
    console.error("[keys] ERROR: Unknown action. Use 'list' or 'revoke --label <label>'");
    process.exit(1);
  }
}

// ── Server startup ────────────────────────────────────────────

async function startServer(): Promise<void> {
  // Phase 3: validate all required env vars before opening anything
  loadSecrets();

  const db = openDb(dbPath);

  // Confirm migrations applied
  const applied = db
    .prepare("SELECT filename FROM _migrations ORDER BY id")
    .all() as { filename: string }[];

  console.error(`[iso27001-mcp] Database ready: ${dbPath}`);
  console.error(`[iso27001-mcp] Applied migrations: ${applied.map((r) => r.filename).join(", ")}`);

  // Phase 2: seed all ISO 27001 reference data (idempotent)
  seedAll(db);

  // Phase 3: warn about admin keys with no expiry
  warnAdminExpiry();

  // Phase 7: select transport based on --mode flag
  const mode = argValue("--mode") ?? "local";
  const server = createServer();

  if (mode === "hosted" || mode === "team") {
    // SSE transport for multi-user modes
    startSseServer(server);
    console.error(`[iso27001-mcp] Server ready — SSE mode on port ${process.env["SSE_PORT"] ?? "3000"}.`);
  } else {
    // stdio transport for local/CI modes (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[iso27001-mcp] Server ready — listening on stdio.");
  }
}
