import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── Server singleton ─────────────────────────────────────────

/**
 * Create and configure the MCP server instance.
 * Tools are registered in Phase 4 — this stub is sufficient for
 * Phase 1 compilation and connection verification.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "iso27001-mcp",
    version: process.env.npm_package_version ?? "2.0.0",
  });

  return server;
}
