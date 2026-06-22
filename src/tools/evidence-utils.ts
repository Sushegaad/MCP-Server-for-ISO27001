/**
 * iso27001-mcp — Shared evidence utilities
 *
 * Used by both evidence-tracking tool handlers and resource callbacks.
 */

/**
 * Returns suggested evidence collection types for a given ISO 27001
 * control theme. Used by evidence gap analysis (tools and resources).
 */
export function suggestedTypes(theme: string): string[] {
  switch (theme) {
    case "Organizational": return ["policy", "procedure", "meeting_minutes"];
    case "People":         return ["training_record", "contract"];
    case "Physical":       return ["configuration", "screenshot", "log"];
    case "Technological":  return ["log", "configuration", "screenshot", "test_result"];
    default:               return ["policy", "procedure"];
  }
}
