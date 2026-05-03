/**
 * iso27001-mcp — MCP server factory
 *
 * createServer() returns a fully configured McpServer with all 43 tools
 * registered. The caller is responsible for connecting a transport and
 * calling transport.start() / server.connect(transport).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

// ── Server factory ───────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name:    "iso27001-mcp",
    version: process.env["npm_package_version"] ?? "2.0.0",
  });

  registerAllTools(server);

  return server;
}
