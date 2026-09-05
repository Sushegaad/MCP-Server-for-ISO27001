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

// ── Call context (set by the security pipeline) ───────────────

import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { businessRule } from "../types/errors.js";

/** Per-call context set by the security pipeline before handler dispatch. */
export interface CallContext {
  keyHash:  string;
  argsHash: string;
  /** Set to true by consumeProposal() on success — the pipeline verifies this
   *  after a confirmed call to any registry entry with `hitl: true`, so a
   *  gated handler that commits without consuming its proposal fails loud. */
  proposalConsumed?: boolean;
}
export const callContext = new AsyncLocalStorage<CallContext>();

/** Recursively sort object keys for a stable serialization. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 over the canonical JSON of args with confirmed/proposal_id removed.
 * The same function runs at preview and at commit, so the digests are
 * comparable regardless of key order or the presence of the control fields.
 */
export function hashArgs(args: Record<string, unknown>): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k !== "confirmed" && k !== "proposal_id") rest[k] = v;
  }
  return createHash("sha256").update(JSON.stringify(canonicalize(rest))).digest("hex");
}

// ── Proposal token store ──────────────────────────────────────
// Short-lived (10 min) single-use tokens bound to a specific tool,
// the authenticated caller (key_hash), the exact argument payload
// (args_hash), and — for update-type tools — the target resource and
// its version at preview time (TOCTOU guard). Prevents a model from
// bypassing HITL by self-confirming, swapping arguments or targets
// after the human saw the preview, or replaying a stale approval.

interface ProposalRecord {
  tool:             string;
  key_hash:         string | null;   // null = created outside the pipeline (unit tests)
  args_hash:        string | null;
  resource_id:      string | null;   // null for create_* tools
  resource_version: string | null;   // target row's updated_at at preview; null for creates
  expires_at:       number;
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
 * Create a single-use proposal token bound to the named tool, the calling
 * credential and argument payload (read from the pipeline's AsyncLocalStorage
 * context — null when the handler is invoked directly, e.g. in unit tests;
 * the pipeline ALWAYS provides it in production), and optionally the target
 * resource and its version at preview time.
 * Returns a UUID the caller embeds in the preview response.
 */
export function createProposal(
  tool: string,
  binding?: { resource_id?: string; resource_version?: string },
): string {
  purgeExpired();
  const ctx = callContext.getStore();
  const id  = randomUUID();
  proposals.set(id, {
    tool,
    key_hash:         ctx?.keyHash  ?? null,
    args_hash:        ctx?.argsHash ?? null,
    resource_id:      binding?.resource_id      ?? null,
    resource_version: binding?.resource_version ?? null,
    expires_at:       Date.now() + PROPOSAL_TTL_MS,
  });
  return id;
}

/**
 * Consume a proposal token, asserting — in order — that it exists, has not
 * expired, was issued for the named tool, was approved under the same
 * credential, covers the exact same argument payload (constant-time compare;
 * resource IDs are part of the hashed args, so this also blocks target
 * substitution), and that the target row has not changed since the preview
 * (TOCTOU guard via `current.resource_version`). Deletes the token
 * (single-use). Throws McpError on any violation.
 */
export function consumeProposal(
  proposal_id: string | undefined,
  tool: string,
  current?: { resource_version?: string },
): void {
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
  const ctx = callContext.getStore();
  if (rec.key_hash !== null && rec.key_hash !== ctx?.keyHash) {
    throw businessRule(
      "proposal_id",
      "Proposal was approved under a different credential. Generate a new preview.",
    );
  }
  if (rec.args_hash !== null) {
    // Constant-time compare; both sides are sha256 hex so lengths are equal.
    const expected = Buffer.from(rec.args_hash, "hex");
    const actual   = Buffer.from(ctx?.argsHash ?? "", "hex");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
      throw businessRule(
        "proposal_id",
        "Arguments differ from the previewed change. Generate a new preview.",
      );
    }
  }
  if (rec.resource_version !== null && current?.resource_version !== undefined
      && current.resource_version !== rec.resource_version) {
    throw businessRule(
      "proposal_id",
      "The record changed since the preview (version conflict). Generate a new preview.",
    );
  }
  proposals.delete(proposal_id); // single-use

  // Mark the gate as executed for this call. The pipeline (src/tools/index.ts)
  // checks this flag after every confirmed call to an `hitl: true` tool.
  if (ctx) ctx.proposalConsumed = true;
}

// ── Actor normalization ───────────────────────────────────────

/**
 * Normalize a human actor name for identity comparison: trim, lowercase,
 * collapse internal whitespace. Used by independence rules (e.g. the
 * verify_evidence reviewer-vs-collector check) so trivial casing/spacing
 * variants of the same name cannot defeat the rule.
 */
export function normalizeActor(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
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
 * tool-specific `message` override — via `extras`. Update-type handlers pass
 * `binding` ({ resource_id, resource_version }) so the token is pinned to the
 * target row's state at preview time.
 */
export function buildPreviewResponse(
  tool: string,
  rows: DiffRow[],
  extras: PreviewExtras = {},
  binding?: { resource_id?: string; resource_version?: string },
): Record<string, unknown> {
  const { message, ...rest } = extras;
  return {
    hitl_proposed: true,
    status:        "preview",
    proposal_id:   createProposal(tool, binding),
    expires_in:    "10 minutes",
    ...rest,
    message:       message ?? DEFAULT_PREVIEW_MESSAGE,
    diff:          buildDiffTable(rows),
  };
}

/**
 * @internal Test-only helper — seeds a proposal token directly into the store,
 * bypassing the preview call. Allows unit tests to call commit branches without
 * needing to duplicate mock-DB stubs for the preview path. The default (no
 * `binding`) seeds an unbound proposal that consumes successfully regardless
 * of context — preserving pre-Phase-1 test behavior.
 * Do not use outside of test files.
 */
export function _testSeedProposal(
  id: string,
  tool: string,
  binding?: Partial<ProposalRecord>,
): void {
  if (!process.env["VITEST"]) throw new Error("_testSeedProposal is test-only");
  proposals.set(id, {
    tool,
    key_hash:         binding?.key_hash         ?? null,
    args_hash:        binding?.args_hash        ?? null,
    resource_id:      binding?.resource_id      ?? null,
    resource_version: binding?.resource_version ?? null,
    expires_at:       binding?.expires_at       ?? Date.now() + PROPOSAL_TTL_MS,
  });
}
