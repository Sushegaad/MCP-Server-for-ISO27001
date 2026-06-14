/**
 * iso27001-mcp — Human-in-the-Loop (HITL) utilities
 *
 * buildDiffTable() renders a Markdown table showing field-level changes for
 * the preview response returned when `confirmed` is omitted from a gated tool.
 *
 * Usage in a handler:
 *   import { buildDiffTable, type DiffRow } from "./hitl-utils.js";
 *
 *   if (!confirmed) {
 *     const rows: DiffRow[] = [];
 *     if (likelihood !== undefined && likelihood !== current.likelihood)
 *       rows.push({ field: "likelihood", old: current.likelihood, new: likelihood });
 *     return ok({ hitl_proposed: true, diff: buildDiffTable(rows), ... });
 *   }
 */

export interface DiffRow {
  field: string;
  old:   unknown;
  new:   unknown;
}

function formatVal(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) {
    const items = (v as unknown[]).map(String);
    return items.length === 0 ? "`[]`" : "`[" + items.join(", ") + "]`";
  }
  if (typeof v === "boolean") return v ? "`true`" : "`false`";
  return "`" + String(v) + "`";
}

/**
 * Render a Markdown diff table from an array of changed fields.
 * Returns a no-changes notice when the array is empty.
 */
export function buildDiffTable(rows: DiffRow[]): string {
  if (rows.length === 0) return "_No fields would change._";
  const lines = [
    "| Field | Current Value | Proposed Value |",
    "|-------|--------------|----------------|",
    ...rows.map((r) =>
      `| \`${r.field}\` | ${formatVal(r.old)} | ${formatVal(r.new)} |`,
    ),
  ];
  return lines.join("\n");
}
