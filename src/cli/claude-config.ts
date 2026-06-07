/**
 * iso27001-mcp — Claude Desktop config helpers
 *
 * Shared between `init` and `doctor` so path detection logic lives in one place.
 */

import { existsSync } from "node:fs";
import { join }       from "node:path";
import { homedir }    from "node:os";

// ── Path detection ────────────────────────────────────────────

/**
 * Return the absolute path to claude_desktop_config.json if it exists,
 * or null if Claude Desktop is not installed / config not found.
 *
 * Search order per platform:
 *   macOS   — ~/Library/Application Support/Claude/
 *   Windows — %APPDATA%\Claude\
 *   Linux   — $XDG_CONFIG_HOME/Claude/ or ~/.config/Claude/
 */
export function findClaudeDesktopConfig(): string | null {
  const home      = homedir();
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    );
  } else if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
    candidates.push(join(appData, "Claude", "claude_desktop_config.json"));
  } else {
    // Linux / other
    const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
    candidates.push(join(xdgConfig, "Claude", "claude_desktop_config.json"));
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── Config entry builder ──────────────────────────────────────

/** Normalise a filesystem path for JSON — always use forward slashes. */
export function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Absolute paths to the Node binary and the MCP entry script.
 *
 * When provided to buildMcpEntry, the config uses `command: node, args: [script]`
 * instead of `command: "iso27001-mcp"`. This is critical for users who manage
 * Node via nvm or Volta: Claude Desktop is a GUI app and does not source shell
 * startup files, so "iso27001-mcp" may not be on Claude Desktop's PATH even
 * though it resolves fine in a terminal.
 *
 * Capture at init time via:
 *   { node: process.execPath, script: process.argv[1] }
 */
export interface ResolvedBinPaths {
  /** Absolute path to the Node.js binary (process.execPath). */
  node:   string;
  /** Absolute path to dist/index.js for this package (process.argv[1]). */
  script: string;
}

/**
 * Return the JSON object that should be merged under `mcpServers`
 * in claude_desktop_config.json.
 *
 * When `bin` is supplied (from `init`, which knows the absolute paths at
 * runtime), the entry uses `command: "/abs/node", args: ["/abs/script"]`
 * to bypass PATH entirely — required for nvm / Volta users on macOS where
 * Claude Desktop launches without a full login-shell PATH.
 *
 * When `bin` is omitted (for the user-facing manual block), the entry
 * falls back to `command: "iso27001-mcp"` which is portable across machines.
 *
 * auditLogPath is included so the server writes its audit log next to the
 * database rather than wherever the process CWD happens to be.
 * All paths are normalised to forward slashes for cross-platform JSON.
 */
export function buildMcpEntry(
  dbEncryptionKey: string,
  hmacSecret:      string,
  apiKey:          string,
  dbPath:          string,
  auditLogPath:    string,
  bin?:            ResolvedBinPaths,
): Record<string, unknown> {
  const commandSection: Record<string, unknown> = bin
    ? { command: normPath(bin.node), args: [normPath(bin.script)] }
    : { command: "iso27001-mcp" };

  return {
    ...commandSection,
    env: {
      DB_ENCRYPTION_KEY: dbEncryptionKey,
      HMAC_SECRET:       hmacSecret,
      MCP_API_KEY:       apiKey,
      DB_PATH:           normPath(dbPath),
      AUDIT_LOG_PATH:    normPath(auditLogPath),
    },
  };
}

/**
 * Return a formatted JSON snippet the user can paste manually into
 * their Claude Desktop config under the `mcpServers` key.
 * Uses the portable `command: "iso27001-mcp"` form (no absolute paths).
 */
export function manualConfigBlock(
  dbEncryptionKey: string,
  hmacSecret:      string,
  apiKey:          string,
  dbPath:          string,
  auditLogPath:    string,
): string {
  // Intentionally omits bin — manual blocks must be machine-portable.
  const snippet = {
    "iso27001-mcp": buildMcpEntry(dbEncryptionKey, hmacSecret, apiKey, dbPath, auditLogPath),
  };
  return JSON.stringify(snippet, null, 2);
}
