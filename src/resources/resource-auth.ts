/**
 * iso27001-mcp — Slim authentication helper for MCP Resource callbacks
 *
 * Resources do not run the full 9-step tool pipeline (no Zod parse,
 * no sanitise, no audit write). This helper provides the subset that
 * matters for read access: key validation + role check.
 *
 * Public reference data (controls, clauses) does not call this helper.
 * All other resources call assertResourceAuth(extra) before reading.
 */

import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { validateKey, loadRole } from "../auth/api-key.js";
import { ROLE_LEVEL } from "../auth/rbac.js";
import { rbacDenied } from "../types/errors.js";
import type { Role } from "../auth/api-key.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Extract the API key from request _meta or the MCP_API_KEY environment
 * variable, validate it, and assert the caller holds at least `minRole`.
 *
 * Throws McpError(AUTHENTICATION_FAILED) if the key is missing or invalid.
 * Throws McpError(RBAC_DENIED) if the role is below `minRole`.
 *
 * @param extra   - The RequestHandlerExtra passed to the resource callback
 * @param minRole - Minimum role required (default: "viewer")
 */
export function assertResourceAuth(
  extra:   Extra,
  minRole: Role = "viewer",
): void {
  const rawKey: string =
    ((extra as unknown as { _meta?: { apiKey?: string } })._meta?.apiKey) ??
    process.env["MCP_API_KEY"] ??
    "";

  const keyHash = validateKey(rawKey);   // throws AUTHENTICATION_FAILED if bad
  const role    = loadRole(keyHash);     // throws NOT_FOUND if key not in DB

  if (ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
    throw rbacDenied("resource-read", minRole);
  }
}
