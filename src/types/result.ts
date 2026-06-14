/**
 * iso27001-mcp — Shared tool result type and helper.
 *
 * All 63 tool handlers return ToolResult.
 * ok() builds the success variant; McpError.toToolResult() builds the error variant.
 */

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
};

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}
