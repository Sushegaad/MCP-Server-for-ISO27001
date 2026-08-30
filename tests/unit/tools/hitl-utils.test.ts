/**
 * Unit tests for src/tools/hitl-utils.ts
 *
 * Tests: buildDiffTable, createProposal, consumeProposal, _testSeedProposal,
 * hashArgs/callContext and the Phase 1 mutation-binding invariants.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDiffTable,
  type DiffRow,
  createProposal,
  consumeProposal,
  _testSeedProposal,
  callContext,
  hashArgs,
  type CallContext,
} from "../../../src/tools/hitl-utils.js";
import { McpError } from "../../../src/types/errors.js";

// ── buildDiffTable ────────────────────────────────────────────

describe("buildDiffTable", () => {
  it("returns no-changes notice for empty array", () => {
    expect(buildDiffTable([])).toBe("_No fields would change._");
  });

  it("renders a markdown table for one changed field", () => {
    const rows: DiffRow[] = [{ field: "status", old: "open", new: "mitigated" }];
    const output = buildDiffTable(rows);
    expect(output).toContain("| Field |");
    expect(output).toContain("`status`");
    expect(output).toContain("`open`");
    expect(output).toContain("`mitigated`");
  });

  it("renders null values as —", () => {
    const rows: DiffRow[] = [{ field: "owner", old: null, new: null }];
    const output = buildDiffTable(rows);
    expect(output).toMatch(/\| `owner` \| — \| — \|/);
  });

  it("renders boolean values with backticks", () => {
    const rows: DiffRow[] = [{ field: "flag", old: false, new: true }];
    const output = buildDiffTable(rows);
    expect(output).toContain("`false`");
    expect(output).toContain("`true`");
  });

  it("renders empty arrays as `[]`", () => {
    const rows: DiffRow[] = [{ field: "controls", old: [], new: ["8.1", "8.2"] }];
    const output = buildDiffTable(rows);
    expect(output).toContain("`[]`");
    expect(output).toContain("`[8.1, 8.2]`");
  });
});

// ── Proposal token store ──────────────────────────────────────

describe("createProposal", () => {
  it("returns a UUID string", () => {
    const id = createProposal("update_risk");
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("returns a different ID on each call", () => {
    const id1 = createProposal("update_risk");
    const id2 = createProposal("update_risk");
    expect(id1).not.toBe(id2);
  });
});

describe("consumeProposal", () => {
  it("succeeds and deletes the token (single-use)", () => {
    const id = createProposal("update_risk");
    expect(() => consumeProposal(id, "update_risk")).not.toThrow();
    // Second call with the same id must fail — token was deleted
    expect(() => consumeProposal(id, "update_risk")).toThrow(McpError);
  });

  it("throws McpError when proposal_id is undefined", () => {
    expect(() => consumeProposal(undefined, "update_risk")).toThrow(McpError);
  });

  it("throws McpError when proposal_id is not found", () => {
    expect(() => consumeProposal("00000000-0000-0000-0000-000000000000", "update_risk")).toThrow(McpError);
  });

  it("throws McpError when proposal_id is for a different tool", () => {
    const id = createProposal("update_risk");
    expect(() => consumeProposal(id, "update_policy")).toThrow(McpError);
  });

  it("throws McpError with 'Proposal was issued for' when tool name mismatches", () => {
    const id = createProposal("update_risk");
    let caught: McpError | null = null;
    try {
      consumeProposal(id, "update_policy");
    } catch (e) {
      caught = e as McpError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/update_risk/);
  });

  it("throws McpError when proposal is expired", () => {
    // Seed a proposal with expires_at in the past
    const id = "expired-test-uuid";
    // Use _testSeedProposal then monkey-patch expiry via the module's internal map
    // We can't directly set TTL to past, so instead we use fake timers
    vi.useFakeTimers();
    _testSeedProposal(id, "update_risk");
    // Advance time past the 10-minute TTL
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(() => consumeProposal(id, "update_risk")).toThrow(McpError);
    vi.useRealTimers();
  });

  it("purges expired proposals during createProposal", () => {
    vi.useFakeTimers();
    const oldId = createProposal("update_risk");
    // Advance past TTL
    vi.advanceTimersByTime(11 * 60 * 1000);
    // Creating a new proposal triggers purgeExpired
    createProposal("update_policy");
    // The old id should be gone (purged)
    expect(() => consumeProposal(oldId, "update_risk")).toThrow(McpError);
    vi.useRealTimers();
  });
});

describe("_testSeedProposal", () => {
  it("seeds a proposal that consumeProposal can consume", () => {
    const id = "seeded-test-uuid";
    _testSeedProposal(id, "complete_management_review");
    expect(() => consumeProposal(id, "complete_management_review")).not.toThrow();
  });
});

// ── hashArgs (canonicalization) ───────────────────────────────

describe("hashArgs", () => {
  it("hashes identical args in different key orders equally", () => {
    const a = hashArgs({ risk_id: "R-1", likelihood: 3, owner: "alice" });
    const b = hashArgs({ owner: "alice", risk_id: "R-1", likelihood: 3 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("excludes confirmed and proposal_id from the hash", () => {
    const bare      = hashArgs({ risk_id: "R-1", likelihood: 3 });
    const preview   = hashArgs({ risk_id: "R-1", likelihood: 3, confirmed: false });
    const committed = hashArgs({ risk_id: "R-1", likelihood: 3, confirmed: true, proposal_id: "abc" });
    expect(preview).toBe(bare);
    expect(committed).toBe(bare);
  });

  it("canonicalizes nested objects and arrays recursively", () => {
    const a = hashArgs({ meta: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] });
    const b = hashArgs({ list: [{ x: 1, y: 2 }], meta: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it("preserves array element order (arrays are not sorted)", () => {
    const a = hashArgs({ controls: ["8.1", "8.2"] });
    const b = hashArgs({ controls: ["8.2", "8.1"] });
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different argument values", () => {
    const a = hashArgs({ risk_id: "R-1", likelihood: 3 });
    const b = hashArgs({ risk_id: "R-1", likelihood: 5 });
    expect(a).not.toBe(b);
  });
});

// ── Phase 1 invariants: mutation-bound proposals ──────────────

describe("mutation-bound proposals (Phase 1 invariants)", () => {
  const KEY_A = "a".repeat(64);
  const KEY_B = "b".repeat(64);

  const ctxFor = (keyHash: string, args: Record<string, unknown>): CallContext => ({
    keyHash,
    argsHash: hashArgs(args),
  });

  function messageOf(fn: () => void): string {
    try {
      fn();
    } catch (e) {
      return (e as McpError).message;
    }
    throw new Error("expected consumeProposal to throw");
  }

  it("accepts commit with identical caller, args and resource version (happy path)", () => {
    const args = { risk_id: "RISK-01", likelihood: 3 };
    const id = callContext.run(ctxFor(KEY_A, args), () =>
      createProposal("update_risk", { resource_id: "RISK-01", resource_version: "2026-01-01" }),
    );
    // Commit carries confirmed/proposal_id — excluded from the hash, so it matches
    const commitArgs = { ...args, confirmed: true, proposal_id: id };
    expect(() =>
      callContext.run(ctxFor(KEY_A, commitArgs), () =>
        consumeProposal(id, "update_risk", { resource_version: "2026-01-01" }),
      ),
    ).not.toThrow();
  });

  it("rejects commit with a proposal generated for DIFFERENT parameters", () => {
    const id = callContext.run(ctxFor(KEY_A, { risk_id: "RISK-01", likelihood: 3 }), () =>
      createProposal("update_risk"),
    );
    const msg = messageOf(() =>
      callContext.run(ctxFor(KEY_A, { risk_id: "RISK-01", likelihood: 5 }), () =>
        consumeProposal(id, "update_risk"),
      ),
    );
    expect(msg).toMatch(/Arguments differ from the previewed change/);
  });

  it("rejects commit with a proposal generated for a different target object", () => {
    const id = callContext.run(ctxFor(KEY_A, { risk_id: "RISK-01", likelihood: 3 }), () =>
      createProposal("update_risk", { resource_id: "RISK-01", resource_version: "2026-01-01" }),
    );
    // Same field values, different target — resource id is part of the hashed args
    const msg = messageOf(() =>
      callContext.run(ctxFor(KEY_A, { risk_id: "RISK-99", likelihood: 3 }), () =>
        consumeProposal(id, "update_risk", { resource_version: "2026-01-01" }),
      ),
    );
    expect(msg).toMatch(/Arguments differ from the previewed change/);
  });

  it("rejects commit under a DIFFERENT key_hash", () => {
    const args = { risk_id: "RISK-01", likelihood: 3 };
    const id = callContext.run(ctxFor(KEY_A, args), () => createProposal("update_risk"));
    const msg = messageOf(() =>
      callContext.run(ctxFor(KEY_B, args), () => consumeProposal(id, "update_risk")),
    );
    expect(msg).toMatch(/approved under a different credential/);
  });

  it("rejects commit with an obsolete resource_version (TOCTOU)", () => {
    const id = "toctou-test-uuid";
    _testSeedProposal(id, "update_risk", { resource_version: "2026-01-01" });
    const msg = messageOf(() =>
      consumeProposal(id, "update_risk", { resource_version: "2026-02-02" }),
    );
    expect(msg).toMatch(/changed since the preview \(version conflict\)/);
  });

  it("rejects a second consume of the same id (replay)", () => {
    const args = { risk_id: "RISK-01", likelihood: 3 };
    const ctx  = ctxFor(KEY_A, args);
    const id   = callContext.run(ctx, () => createProposal("update_risk"));
    callContext.run(ctx, () => consumeProposal(id, "update_risk"));
    expect(() =>
      callContext.run(ctx, () => consumeProposal(id, "update_risk")),
    ).toThrow(McpError);
  });

  it("still consumes an unbound proposal (created outside any context) successfully", () => {
    // Handlers called directly in unit tests run without ALS context —
    // createProposal stores null bindings and consumption stays permissive.
    const id = createProposal("update_risk");
    expect(() => consumeProposal(id, "update_risk")).not.toThrow();
  });

  it("rejects a bound proposal consumed OUTSIDE any context", () => {
    const id = callContext.run(ctxFor(KEY_A, { risk_id: "RISK-01" }), () =>
      createProposal("update_risk"),
    );
    const msg = messageOf(() => consumeProposal(id, "update_risk"));
    expect(msg).toMatch(/approved under a different credential/);
  });

  it("skips the version check when the commit provides no current version", () => {
    // Seeded/legacy proposals carry a version but a create-path consume
    // passes none — the check only fires when both sides are present.
    const id = "no-current-version-uuid";
    _testSeedProposal(id, "update_risk", { resource_version: "2026-01-01" });
    expect(() => consumeProposal(id, "update_risk")).not.toThrow();
  });
});
