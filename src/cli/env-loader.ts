/**
 * iso27001-mcp — .env file auto-loader
 *
 * Used by CLI subcommands (keygen, keys, doctor) that run from the user's
 * shell, where secrets aren't injected by Claude Desktop.
 *
 * When Claude Desktop launches the MCP server it injects env vars directly
 * via the JSON config — loadDotEnvFile() is NOT called in that path.
 *
 * Search order for the .env file:
 *   1. Path recorded in ~/.iso27001/.env-location (written by init when a
 *      non-default location was chosen — ensures keygen/doctor work from
 *      any working directory after a custom-path install)
 *   2. ~/.iso27001/.env  (default iso27001-mcp init location)
 *   3. <cwd>/.env        (current-directory install)
 *   4. <dirname(DB_PATH)>/.env  (DB_PATH-derived, if already in process.env)
 *
 * After loading the .env, the function also attempts to read MCP_API_KEY
 * from the Claude Desktop config so that `iso27001-mcp doctor` gives a
 * correct result without requiring the user to export the key manually.
 *
 * Rules:
 *   • Only sets vars NOT already present in process.env (shell exports win).
 *   • Uses the first .env file found — does not merge multiple files.
 *   • Never throws — silently returns if no file is found or readable.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join }            from "node:path";
import { homedir }                  from "node:os";
import { findClaudeDesktopConfig }  from "./claude-config.js";

export function loadDotEnvFile(): void {
  const home = homedir();

  // ── Build the candidate list ─────────────────────────────────

  const candidates: string[] = [];

  // 1. Pointer file written by init when non-default path was chosen
  const locationPtr = join(home, ".iso27001", ".env-location");
  if (existsSync(locationPtr)) {
    try {
      const customPath = readFileSync(locationPtr, "utf8").trim();
      if (customPath && existsSync(customPath)) candidates.push(customPath);
    } catch { /* ignore */ }
  }

  // 2. Default init location
  candidates.push(join(home, ".iso27001", ".env"));

  // 3. Current working directory
  candidates.push(join(process.cwd(), ".env"));

  // 4. Directory that contains DB_PATH (if already set)
  const dbPath = process.env["DB_PATH"];
  if (dbPath) candidates.push(join(dirname(dbPath), ".env"));

  // ── Load the first readable .env file found ──────────────────

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;

    let content: string;
    try { content = readFileSync(filePath, "utf8"); }
    catch { continue; }

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      // Only set non-empty values; never override a var already in process.env.
      if (key && val && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }

    break; // Stop after first file found — do not merge multiple files
  }

  // ── Extract MCP_API_KEY from Claude Desktop config ───────────
  //
  // MCP_API_KEY is NOT stored in the .env file — it lives only in the
  // Claude Desktop JSON config (which Claude Desktop injects at startup).
  // When the user runs `doctor` or `keygen` from a shell, the key is
  // absent from process.env, causing Check 3 of doctor to fail even
  // after a successful install.  Read it from the config as a fallback.

  if (process.env["MCP_API_KEY"] === undefined) {
    const configPath = findClaudeDesktopConfig();
    if (configPath && existsSync(configPath)) {
      try {
        const raw    = readFileSync(configPath, "utf8");
        const config = JSON.parse(raw) as {
          mcpServers?: Record<string, { env?: Record<string, string> }>;
        };
        const mcpKey = config.mcpServers?.["iso27001-mcp"]?.env?.["MCP_API_KEY"];
        if (mcpKey) process.env["MCP_API_KEY"] = mcpKey;
      } catch { /* ignore malformed config — doctor will report the problem */ }
    }
  }
}
