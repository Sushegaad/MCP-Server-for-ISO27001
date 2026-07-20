/**
 * iso27001-mcp — Role-Based Access Control
 *
 * Permission matrix covering all 52 tools × 3 roles.
 * Roles are hierarchical: admin ⊇ analyst ⊇ viewer.
 * 13 read-only tools have been retired to MCP Resources (iso27001:// URIs).
 *
 * The per-tool minimum-role data lives in the unified registry
 * (src/tools/registry.ts) — TOOL_MIN_ROLE is a view derived from it,
 * re-exported here so existing consumers keep the same import path.
 *
 * checkPermission(role, toolName) — returns true if allowed
 * minimumRole(toolName)           — returns the minimum role needed
 * assertPermission(role, toolName) — throws RBAC_DENIED if not allowed
 */

import type { Role } from "./api-key.js";
import { rbacDenied } from "../types/errors.js";
import { TOOL_MIN_ROLE } from "../tools/registry.js";

export { TOOL_MIN_ROLE };

// ── Role hierarchy ────────────────────────────────────────────

export const ROLE_LEVEL: Record<Role, number> = {
  viewer:  0,
  analyst: 1,
  admin:   2,
};

// ── Public API ────────────────────────────────────────────────

/**
 * Return true if the given role is permitted to call the tool.
 * Unknown tool names default to requiring admin (fail-safe).
 */
export function checkPermission(role: Role, toolName: string): boolean {
  const minRole = TOOL_MIN_ROLE[toolName] ?? "admin";
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
}

/**
 * Return the minimum role required for a tool.
 * Unknown tools require admin by default.
 */
export function minimumRole(toolName: string): Role {
  return TOOL_MIN_ROLE[toolName] ?? "admin";
}

/**
 * Assert that the role is permitted to call the tool.
 * Throws a structured RBAC_DENIED McpError if not.
 */
export function assertPermission(role: Role, toolName: string): void {
  if (!checkPermission(role, toolName)) {
    throw rbacDenied(toolName, minimumRole(toolName));
  }
}

/**
 * Return the full set of tool names a given role may call.
 * Useful for generating docs or test coverage lists.
 */
export function toolsForRole(role: Role): string[] {
  return Object.entries(TOOL_MIN_ROLE)
    .filter(([, minRole]) => ROLE_LEVEL[role] >= ROLE_LEVEL[minRole])
    .map(([toolName]) => toolName)
    .sort();
}

/** Total registered tool count — must equal 52 (13 read-only tools retired to MCP Resources). */
export const TOTAL_TOOLS = Object.keys(TOOL_MIN_ROLE).length;
