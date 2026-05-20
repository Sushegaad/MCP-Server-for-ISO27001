/**
 * iso27001-mcp — MCP server factory
 *
 * createServer() returns a fully configured McpServer with all 50 tools
 * and 12 MCP resources registered. The caller is responsible for
 * connecting a transport and calling server.connect(transport).
 *
 * Resources are browseable via the iso27001:// URI scheme:
 *   - Public: iso27001://control/*, iso27001://clause/*
 *   - Viewer: iso27001://org/profile, iso27001://policy/*, iso27001://procedure/*,
 *             iso27001://risk/*, iso27001://assessment/*, iso27001://soa/*, iso27001://audit/*
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools }     from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";

// ── Server factory ───────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name:    "iso27001-mcp",
    version: process.env["npm_package_version"] ?? "2.0.0",
  });

  registerAllTools(server);
  registerAllResources(server);

  return server;
}
