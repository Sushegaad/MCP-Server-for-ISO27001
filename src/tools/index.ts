/**
 * iso27001-mcp — Tool execution pipeline
 *
 * registerAllTools(server) wires all tools from the unified registry
 * (src/tools/registry.ts — the single source of truth for name,
 * description, minimum role, schema, and handler) into the MCP server
 * with the full security pipeline per §6 of the spec:
 *
 * Read-only lookups previously exposed as tools are now MCP Resources
 * (iso27001:// URIs via registerAllResources) and have been retired here.
 *
 *   1. Extract credential from _meta.apiKey or MCP_API_KEY env var
 *   2a. If it is an SSE session token → lookupSessionToken() → { keyHash, role }
 *       (auth already validated at /sse connect time; raw key never re-transmitted)
 *   2b. Otherwise → validateKey(rawKey) → keyHash, then loadRole(keyHash)
 *   3. checkRateLimit(keyHash)
 *   4. assertPermission(role, tool)
 *   5. sanitiseParams(args)
 *   6. Full-schema Zod validation — enforces .refine() cross-field rules
 *      the SDK's extracted-shape validation cannot see
 *   7. Call domain handler (with the parsed, defaulted, sanitised args)
 *   8. writeAuditEvent(...)         — always runs (success + error paths)
 *   9. Return result or McpError.toToolResult()
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateKey, loadRole } from "../auth/api-key.js";
import { isSessionToken, lookupSessionToken } from "../auth/session-store.js";
import { assertPermission } from "../auth/rbac.js";
import { checkRateLimit } from "../security/rate-limiter.js";
import { sanitiseParams } from "../security/sanitise.js";
import { writeAuditEvent, buildParamsJson } from "../audit/logger.js";
import { McpError } from "../types/errors.js";
import type { ToolResult } from "../types/result.js";
import { TOOLS } from "./registry.js";

// ── extractShape ─────────────────────────────────────────────
// MCP SDK registerTool() expects a ZodRawShape, not a full ZodObject.
// Schemas built with .refine() are ZodEffects — loop to unwrap ALL
// levels so nested .refine().refine() chains don't silently lose shape.
//
// unwrapFieldSchema() additionally unwraps field-level ZodEffects
// (ZodPreprocess / ZodTransform) so the MCP SDK can emit correct
// JSON Schema for each field and Claude receives accurate type hints.
// Runtime validation still uses the original schema.safeParse() in
// the security pipeline — this only affects what Claude sees.

function unwrapFieldSchema(field: z.ZodTypeAny): z.ZodTypeAny {
  // Unwrap preprocess / transform / refine to the representable inner type
  if (field instanceof z.ZodEffects) {
    return unwrapFieldSchema(field.innerType() as z.ZodTypeAny);
  }
  // Preserve the optional wrapper, but unwrap what's inside it
  if (field instanceof z.ZodOptional) {
    return unwrapFieldSchema(field.unwrap() as z.ZodTypeAny).optional();
  }
  // Preserve the default wrapper, but unwrap what's inside it
  if (field instanceof z.ZodDefault) {
    const inner    = unwrapFieldSchema(field.removeDefault() as z.ZodTypeAny);
    const defValue = (field._def as { defaultValue: () => unknown }).defaultValue();
    return inner.optional().default(defValue);
  }
  return field;
}

function extractShape(schema: z.ZodTypeAny): z.ZodRawShape {
  let s: z.ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) {
    s = s.innerType() as z.ZodTypeAny;
  }
  const rawShape = (s as z.ZodObject<z.ZodRawShape>).shape;

  // Unwrap field-level ZodEffects so the SDK generates correct JSON Schema
  const cleanShape: z.ZodRawShape = {};
  for (const [key, val] of Object.entries(rawShape)) {
    cleanShape[key] = unwrapFieldSchema(val as unknown as z.ZodTypeAny);
  }
  return cleanShape;
}

// ── registerAllTools ──────────────────────────────────────────

/**
 * Register all ISO 27001 MCP tools with the server.
 * Each tool callback runs the full security pipeline.
 * Read-only lookup tools have been retired to MCP Resources (iso27001:// URIs).
 */
export function registerAllTools(server: McpServer): void {
  for (const { name: toolName, description, schema, handler } of TOOLS) {
    const shape = extractShape(schema);

    // Each tool gets the same pipeline wrapper
    server.tool(toolName, description, shape, async (args, extra) => {
      const startMs = Date.now();

      // ── Step 1: extract credential + provenance from request meta ──
      const metaExtra = extra as unknown as {
        _meta?: {
          apiKey?:     string;
          actor_type?: "ai" | "human" | "system";
          model_id?:   string;
        };
      };
      const credential: string =
        metaExtra._meta?.apiKey ?? process.env["MCP_API_KEY"] ?? "";
      const actor_type = metaExtra._meta?.actor_type ?? "ai";
      const model_id   = metaExtra._meta?.model_id   ?? null;

      // Audit scaffolding — filled in as pipeline progresses
      let keyHash      = "";
      let role         = "unknown";
      let outcome: "success" | "denied" | "error" | "proposed" = "error";
      let errorMessage: string | null = null;
      let result: ToolResult;

      try {
        // ── Step 2: auth ──────────────────────────────────────
        // SSE sessions use an opaque session token that maps to a pre-validated
        // { keyHash, role } — no raw key is re-transmitted or re-HMAC'd.
        // Stdio / direct API calls use a raw iso27001_... key as before.
        if (isSessionToken(credential)) {
          const session = lookupSessionToken(credential);
          if (!session) {
            throw new McpError({ error_code: "AUTH_INVALID", message: "Session token is invalid or expired" });
          }
          keyHash = session.keyHash;
          role    = session.role;
        } else {
          keyHash = validateKey(credential);
          role    = loadRole(keyHash);
        }

        // ── Step 3: rate limit ────────────────────────────────
        checkRateLimit(keyHash);

        // ── Step 4: RBAC ──────────────────────────────────────
        assertPermission(role as "viewer" | "analyst" | "admin", toolName);

        // ── Step 5: sanitise free-text inputs (mutates args in place) ──
        const { sanitisedFields } = sanitiseParams(args as Record<string, unknown>);

        // ── Step 6: full-schema validation (enforces .refine() rules
        //    the SDK's extracted-shape validation cannot see) ────────
        const parsed = schema.safeParse(args ?? {});
        if (!parsed.success) {
          const issues = parsed.error.issues;
          throw new McpError({
            error_code: "VALIDATION_ERROR",
            message:    issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
            field:      issues[0]?.path.join(".") || undefined,
            hint:       "Check the parameter types and cross-field constraints",
          });
        }

        // ── Step 7: call domain handler ───────────────────────
        result = await handler(parsed.data as Record<string, unknown>);

        if (result.isError) {
          outcome = "error";
          try {
            const parsedBody = JSON.parse(result.content[0].text) as { message?: string };
            errorMessage = parsedBody.message ?? "handler returned isError=true";
          } catch {
            errorMessage = "handler returned isError=true";
          }
        } else {
          try {
            const parsedBody = JSON.parse(result.content[0].text) as { hitl_proposed?: boolean };
            outcome = parsedBody.hitl_proposed === true ? "proposed" : "success";
          } catch {
            outcome = "success";
          }
        }

        // ── Step 8 (success path): write audit event ──────────
        writeAuditEvent({
          tool:          toolName,
          key_hash:      keyHash,
          role,
          params_json:   buildParamsJson(args as Record<string, unknown>, sanitisedFields),
          outcome,
          error_message: errorMessage,
          duration_ms:   Date.now() - startMs,
          actor_type,
          model_id,
        });

        return result;

      } catch (err) {
        if (err instanceof McpError) {
          outcome      = err.error_code === "RBAC_DENIED" ? "denied" : "error";
          errorMessage = err.message;
          result       = err.toToolResult();
        } else {
          outcome      = "error";
          errorMessage = err instanceof Error ? err.message : String(err);
          result = {
            content: [{ type: "text", text: JSON.stringify({
              error_code:  "INTERNAL_ERROR",
              message:     errorMessage,
              http_status: 500,
            }) }],
            isError: true,
          };
        }

        // ── Step 9 (error path): always write audit event ─────
        try {
          writeAuditEvent({
            tool:          toolName,
            key_hash:      keyHash,
            role,
            params_json:   buildParamsJson(args as Record<string, unknown>),
            outcome,
            error_message: errorMessage,
            duration_ms:   Date.now() - startMs,
            actor_type,
            model_id,
          });
        } catch (auditErr) {
          console.error("[tools] Failed to write audit event:", auditErr);
        }

        return result;
      }
    });
  }

  console.error(`[tools] Registered ${TOOLS.length} tools.`);
}
