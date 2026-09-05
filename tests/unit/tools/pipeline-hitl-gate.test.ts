/**
 * Unit tests for the pipeline-level HITL gate verification (src/tools/index.ts).
 *
 * Registry entries with `hitl: true` must consume a proposal token on every
 * confirmed call. A handler that "commits" without consuming is a server bug —
 * the pipeline detects it (via CallContext.proposalConsumed) and converts the
 * silent bypass into a loud INTERNAL_ERROR.
 *
 * Auth, RBAC, rate limiting, sanitisation, audit, and the update_risk domain
 * handler are mocked; the registry, schemas and pipeline are real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Pipeline dependency mocks ─────────────────────────────────

vi.mock("../../../src/auth/api-key.js", () => ({
  validateKey: vi.fn(() => "key-hash-1"),
  loadRole:    vi.fn(() => "admin"),
}));
vi.mock("../../../src/auth/session-store.js", () => ({
  isSessionToken:     vi.fn(() => false),
  lookupSessionToken: vi.fn(),
}));
vi.mock("../../../src/security/rate-limiter.js", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("../../../src/auth/rbac.js", () => ({
  assertPermission: vi.fn(),
}));
vi.mock("../../../src/security/sanitise.js", () => ({
  sanitiseParams: vi.fn(() => ({ sanitisedFields: [] })),
}));
vi.mock("../../../src/audit/logger.js", () => ({
  writeAuditEvent: vi.fn(),
  buildParamsJson: vi.fn(() => "{}"),
}));

// Mock ONLY the update_risk handler; keep the rest of the module's exports
// intact so the registry can still import them.
const mockUpdateRisk = vi.fn();
vi.mock("../../../src/tools/risks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    handleUpdateRisk: (args: Record<string, unknown>) => mockUpdateRisk(args) as unknown,
  };
});

// ── SUT imports (after mocks) ─────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../../src/tools/index.js";
import { _testSeedProposal, consumeProposal } from "../../../src/tools/hitl-utils.js";
import { writeAuditEvent } from "../../../src/audit/logger.js";
import type { ToolResult } from "../../../src/types/result.js";

type ToolCb = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<ToolResult>;

const callbacks = new Map<string, ToolCb>();
const fakeServer = {
  tool: (name: string, _desc: string, _shape: unknown, _ann: unknown, cb: ToolCb) => {
    callbacks.set(name, cb);
  },
} as unknown as McpServer;

registerAllTools(fakeServer);

const RISK_ID     = "550e8400-e29b-41d4-a716-446655440000";
const PROPOSAL_ID = "99999999-9999-4999-8999-999999999999";
const EXTRA       = { _meta: { apiKey: "iso27001_test-key" } };

const okResult = (body: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(body) }],
  isError: false,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pipeline HITL gate verification", () => {
  it("registers the update_risk callback", () => {
    expect(callbacks.has("update_risk")).toBe(true);
  });

  it("rejects a confirmed call whose handler did NOT consume a proposal (silent bypass → loud error)", async () => {
    // Buggy handler: commits and returns success without consuming.
    mockUpdateRisk.mockReturnValue(okResult({ id: RISK_ID, status: "accepted" }));

    const result = await callbacks.get("update_risk")!(
      { risk_id: RISK_ID, status: "accepted", confirmed: true, proposal_id: PROPOSAL_ID },
      EXTRA,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text) as { error_code: string; message: string };
    expect(body.error_code).toBe("INTERNAL_ERROR");
    expect(body.message).toMatch(/HITL gate did not execute for a confirmed call/);

    // The incident is audited as an error, not a success
    const auditCalls = vi.mocked(writeAuditEvent).mock.calls;
    expect(auditCalls.at(-1)?.[0]).toMatchObject({ tool: "update_risk", outcome: "error" });
  });

  it("passes a confirmed call whose handler consumes its proposal", async () => {
    _testSeedProposal(PROPOSAL_ID, "update_risk");
    mockUpdateRisk.mockImplementation((args: Record<string, unknown>) => {
      // Well-behaved commit branch: consume, then "write".
      consumeProposal(args["proposal_id"] as string, "update_risk");
      return okResult({ id: RISK_ID, status: "accepted" });
    });

    const result = await callbacks.get("update_risk")!(
      { risk_id: RISK_ID, status: "accepted", confirmed: true, proposal_id: PROPOSAL_ID },
      EXTRA,
    );

    expect(result.isError).toBe(false);
    const auditCalls = vi.mocked(writeAuditEvent).mock.calls;
    expect(auditCalls.at(-1)?.[0]).toMatchObject({ tool: "update_risk", outcome: "success" });
  });

  it("does not apply the gate to unconfirmed (preview) calls", async () => {
    mockUpdateRisk.mockReturnValue(okResult({ hitl_proposed: true, status: "preview" }));

    const result = await callbacks.get("update_risk")!(
      { risk_id: RISK_ID, status: "accepted" },
      EXTRA,
    );

    expect(result.isError).toBe(false);
    const auditCalls = vi.mocked(writeAuditEvent).mock.calls;
    expect(auditCalls.at(-1)?.[0]).toMatchObject({ tool: "update_risk", outcome: "proposed" });
  });

  it("does not mask a handler error result with the gate error", async () => {
    mockUpdateRisk.mockReturnValue({
      content: [{ type: "text", text: JSON.stringify({ error_code: "BUSINESS_RULE", message: "nope" }) }],
      isError: true,
    });

    const result = await callbacks.get("update_risk")!(
      { risk_id: RISK_ID, status: "accepted", confirmed: true, proposal_id: PROPOSAL_ID },
      EXTRA,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text) as { error_code: string };
    expect(body.error_code).toBe("BUSINESS_RULE"); // handler's own error survives
  });
});
