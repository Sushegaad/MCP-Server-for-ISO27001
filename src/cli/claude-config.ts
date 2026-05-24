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

/**
 * Return the JSON object that should be merged under `mcpServers`
 * in claude_desktop_config.json.
 */
export function buildMcpEntry(
  dbEncryptionKey: string,
  hmacSecret:      string,
  apiKey:          string,
  dbPath:          string,
): Record<string, unknown> {
  return {
    command: "iso27001-mcp",
    env: {
      DB_ENCRYPTION_KEY: dbEncryptionKey,
      HMAC_SECRET:       hmacSecret,
      MCP_API_KEY:       apiKey,
      DB_PATH:           dbPath,
    },
  };
}

/**
 * Return a formatted JSON snippet the user can paste manually into
 * their Claude Desktop config under the `mcpServers` key.
 */
export function manualConfigBlock(
  dbEncryptionKey: string,
  hmacSecret:      string,
  apiKey:          string,
  dbPath:          string,
): string {
  const snippet = {
    "iso27001-mcp": buildMcpEntry(dbEncryptionKey, hmacSecret, apiKey, dbPath),
  };
  return JSON.stringify(snippet, null, 2);
}
