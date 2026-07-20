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

// ── Proposal token store ──────────────────────────────────────
// Short-lived (10 min) single-use tokens bound to a specific tool.
// Prevents a model from bypassing HITL by self-confirming without
// ever returning the preview to a human.

import { randomUUID } from "node:crypto";
import { businessRule } from "../types/errors.js";

interface ProposalRecord {
  tool:       string;
  expires_at: number;
}

const proposals = new Map<string, ProposalRecord>();
const PROPOSAL_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Purge expired proposals (called on every create). */
function purgeExpired(): void {
  const now = Date.now();
  for (const [id, rec] of proposals) {
    if (now > rec.expires_at) proposals.delete(id);
  }
}

/**
 * Create a single-use proposal token bound to the named tool.
 * Returns a UUID the caller embeds in the preview response.
 */
export function createProposal(tool: string): string {
  purgeExpired();
  const id = randomUUID();
  proposals.set(id, { tool, expires_at: Date.now() + PROPOSAL_TTL_MS });
  return id;
}

/**
 * Consume a proposal token, asserting it matches the named tool and has not
 * expired. Deletes the token (single-use). Throws McpError on any violation.
 */
export function consumeProposal(proposal_id: string | undefined, tool: string): void {
  if (!proposal_id) {
    throw businessRule(
      "proposal_id",
      "Pass the proposal_id returned by the preview call, then set confirmed=true to commit.",
    );
  }
  const rec = proposals.get(proposal_id);
  if (!rec) {
    throw businessRule(
      "proposal_id",
      "Proposal not found or already used. Call without confirmed=true to generate a new preview.",
    );
  }
  if (Date.now() > rec.expires_at) {
    proposals.delete(proposal_id);
    throw businessRule(
      "proposal_id",
      "Proposal expired (10-minute TTL). Call without confirmed=true to generate a new preview.",
    );
  }
  if (rec.tool !== tool) {
    throw businessRule(
      "proposal_id",
      `Proposal was issued for '${rec.tool}', not '${tool}'.`,
    );
  }
  proposals.delete(proposal_id); // single-use
}

// ── buildPreviewResponse ──────────────────────────────────────

const DEFAULT_PREVIEW_MESSAGE =
  "⏸ No data written. Pass \"confirmed\": true to apply this change.";

export interface PreviewExtras {
  /** Override the default preview message (tool-specific wording). */
  message?: string;
  [key: string]: unknown;
}

/**
 * Build the standard HITL preview response body. Creates a proposal token
 * bound to `tool` and returns the canonical envelope:
 *
 *   { hitl_proposed, status: "preview", proposal_id, expires_in,
 *     ...extras, message, diff }
 *
 * Handlers spread their identifying fields (e.g. risk_id) — and any
 * tool-specific `message` override — via `extras`.
 */
export function buildPreviewResponse(
  tool: string,
  rows: DiffRow[],
  extras: PreviewExtras = {},
): Record<string, unknown> {
  const { message, ...rest } = extras;
  return {
    hitl_proposed: true,
    status:        "preview",
    proposal_id:   createProposal(tool),
    expires_in:    "10 minutes",
    ...rest,
    message:       message ?? DEFAULT_PREVIEW_MESSAGE,
    diff:          buildDiffTable(rows),
  };
}

/**
 * @internal Test-only helper — seeds a proposal token directly into the store,
 * bypassing the preview call. Allows unit tests to call commit branches without
 * needing to duplicate mock-DB stubs for the preview path.
 * Do not use outside of test files.
 */
export function _testSeedProposal(id: string, tool: string): void {
  proposals.set(id, { tool, expires_at: Date.now() + PROPOSAL_TTL_MS });
}
