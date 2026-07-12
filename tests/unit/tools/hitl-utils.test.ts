/**
 * Unit tests for src/tools/hitl-utils.ts
 *
 * Tests: buildDiffTable, createProposal, consumeProposal, _testSeedProposal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDiffTable,
  type DiffRow,
  createProposal,
  consumeProposal,
  _testSeedProposal,
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
