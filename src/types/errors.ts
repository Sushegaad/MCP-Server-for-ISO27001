/**
 * iso27001-mcp — Structured error types
 *
 * Every error that can be returned to a caller is an McpError.
 * Factory functions map to the error codes defined in §9 of the spec.
 * toToolResult() serialises to the JSON envelope the MCP SDK expects.
 */

// ── Error codes ───────────────────────────────────────────────

export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "RBAC_DENIED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "BUSINESS_RULE"
  | "INTERNAL_ERROR"
  | "INTEGRATION_ERROR";

// ── HTTP-like status for each code ───────────────────────────

const HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_MISSING:     401,
  AUTH_INVALID:     401,
  AUTH_EXPIRED:     401,
  AUTH_REVOKED:     401,
  RBAC_DENIED:      403,
  RATE_LIMITED:     429,
  VALIDATION_ERROR: 400,
  NOT_FOUND:        404,
  BUSINESS_RULE:    422,
  INTERNAL_ERROR:   500,
  INTEGRATION_ERROR: 502,
};

// ── Error class ───────────────────────────────────────────────

export class McpError extends Error {
  readonly error_code: ErrorCode;
  readonly http_status: number;
  readonly field?: string;
  readonly hint?: string;
  readonly docs_ref?: string;

  constructor(opts: {
    error_code: ErrorCode;
    message: string;
    field?: string;
    hint?: string;
    docs_ref?: string;
  }) {
    super(opts.message);
    this.name = "McpError";
    this.error_code   = opts.error_code;
    this.http_status  = HTTP_STATUS[opts.error_code];
    this.field        = opts.field;
    this.hint         = opts.hint;
    this.docs_ref     = opts.docs_ref;
  }

  /**
   * Serialise to the structured tool result format expected by the MCP SDK.
   * Returns a single content block with JSON text so Claude can parse it.
   */
  toToolResult(): { content: Array<{ type: "text"; text: string }>; isError: true } {
    const body: Record<string, unknown> = {
      error_code:   this.error_code,
      http_status:  this.http_status,
      message:      this.message,
    };
    if (this.field)    body["field"]    = this.field;
    if (this.hint)     body["hint"]     = this.hint;
    if (this.docs_ref) body["docs_ref"] = this.docs_ref;

    return {
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      isError: true,
    };
  }
}

// ── Factory functions ─────────────────────────────────────────

export function authMissing(): McpError {
  return new McpError({
    error_code: "AUTH_MISSING",
    message:    "No API key provided. Pass your key via MCP_API_KEY env var or _meta.apiKey.",
    hint:       "Set MCP_API_KEY env var or include apiKey in _meta",
  });
}

export function authInvalid(): McpError {
  return new McpError({
    error_code: "AUTH_INVALID",
    message:    "HMAC validation failed. The provided API key is not recognised.",
    hint:       "Verify your API key — run: iso27001-mcp keygen",
  });
}

export function authExpired(): McpError {
  return new McpError({
    error_code: "AUTH_EXPIRED",
    message:    "API key has expired.",
    hint:       "Generate a new key: iso27001-mcp keygen",
  });
}

export function authRevoked(): McpError {
  return new McpError({
    error_code: "AUTH_REVOKED",
    message:    "API key has been revoked.",
    hint:       "Generate a new key: iso27001-mcp keygen --role [role]",
  });
}

export function rbacDenied(toolName: string, requiredRole: string): McpError {
  return new McpError({
    error_code: "RBAC_DENIED",
    message:    `Your role does not have permission to call '${toolName}'. Requires: ${requiredRole}.`,
    hint:       "Your role cannot call this tool — contact your admin to get a key with a higher role",
  });
}

export function rateLimited(): McpError {
  return new McpError({
    error_code: "RATE_LIMITED",
    message:    "Too many requests. Exceeded RATE_LIMIT_RPM.",
    hint:       "Slow down or raise RATE_LIMIT_RPM in your .env",
  });
}

export function validationError(field: string, issue: string): McpError {
  return new McpError({
    error_code: "VALIDATION_ERROR",
    message:    `Validation failed on '${field}': ${issue}`,
    field,
    hint:       "Check the parameter type and constraints",
  });
}

export function notFound(entity: string, id: string): McpError {
  return new McpError({
    error_code: "NOT_FOUND",
    message:    `${entity} not found: ${id}`,
  });
}

export function businessRule(message: string, hint?: string, docsRef?: string): McpError {
  return new McpError({
    error_code: "BUSINESS_RULE",
    message,
    hint,
    docs_ref: docsRef,
  });
}

export function internalError(message: string): McpError {
  return new McpError({
    error_code: "INTERNAL_ERROR",
    message:    `Internal server error: ${message}`,
    hint:       "Check server logs for details",
  });
}

export function integrationError(service: string, message: string, hint?: string): McpError {
  return new McpError({
    error_code: "INTEGRATION_ERROR",
    message:    `${service} integration error: ${message}`,
    hint,
  });
}
