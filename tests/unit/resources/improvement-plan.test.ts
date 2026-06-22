/**
 * Unit tests for src/resources/improvement-plan.ts
 *
 * Covers: registerImprovementPlanResources — list and read callbacks for
 * iso27001-improvement-plan (Clause 10.1 improvement opportunities).
 * Requires viewer auth (assertResourceAuth mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockStmt = { get: vi.fn(), all: vi.fn(() => []) };

const mockDb = {
  prepare: vi.fn(() => mockStmt),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

const mockAssertResourceAuth = vi.fn();
vi.mock("../../../src/resources/resource-auth.js", () => ({
  assertResourceAuth: (...args: unknown[]) => mockAssertResourceAuth(...args),
}));

type ListFn = () => { resources: unknown[] };
type ReadFn = (uri: URL, vars: Record<string, string>, extra: unknown) => Promise<unknown>;
interface Captured { name: string; listFn?: ListFn; readFn: ReadFn }
const captured: Captured[] = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  ResourceTemplate: class {
    _list?: ListFn;
    constructor(public uriTemplate: string, opts: { list?: ListFn }) {
      this._list = opts.list;
    }
  },
}));

const mockServer = {
  resource: vi.fn((name: string, tpl: { _list?: ListFn }, _meta: unknown, readFn: ReadFn) => {
    captured.push({ name, listFn: tpl._list, readFn });
  }),
};

import { registerImprovementPlanResources } from "../../../src/resources/improvement-plan.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockStmt.get.mockReturnValue(undefined);
  mockStmt.all.mockReturnValue([]);
  registerImprovementPlanResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const OPP_ROW = {
  id:          "opp-1",
  title:       "Automate patch management",
  description: "Implement automated patching for all systems",
  source:      "internal_audit",
  priority:    "high",
  owner:       "IT Manager",
  target_date: "2025-09-01",
  status:      "open",
  review_id:   null,
  created_at:  "2025-01-01T00:00:00Z",
  updated_at:  "2025-01-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerImprovementPlanResources", () => {
  it("registers one resource", () => {
    expect(captured).toHaveLength(1);
  });

  it("registers iso27001-improvement-plan with a list callback", () => {
    expect(getResource("iso27001-improvement-plan").listFn).toBeDefined();
  });
});

// ── List callback ─────────────────────────────────────────────

describe("iso27001-improvement-plan list callback", () => {
  it("returns empty resources when no opportunities exist", () => {
    mockStmt.all.mockReturnValue([]);
    const { resources } = getResource("iso27001-improvement-plan").listFn!();
    expect(resources).toHaveLength(0);
  });

  it("maps opportunity rows to resource entries with priority prefix", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "opp-1", title: "Automate patches", priority: "high",
        status: "open", owner: "IT Manager", target_date: "2025-09-01",
      },
    ]);
    const { resources } = getResource("iso27001-improvement-plan").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://improvement-plan/opp-1");
    expect((resources[0] as { name: string }).name).toContain("[high]");
    expect((resources[0] as { name: string }).name).toContain("Automate patches");
    expect((resources[0] as { mimeType: string }).mimeType).toBe("application/json");
  });

  it("includes owner in description when present", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "opp-1", title: "Automate patches", priority: "high",
        status: "open", owner: "Alice", target_date: null,
      },
    ]);
    const { resources } = getResource("iso27001-improvement-plan").listFn!();
    expect((resources[0] as { description: string }).description).toContain("Alice");
  });

  it("includes due date in description when present", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "opp-1", title: "Automate patches", priority: "high",
        status: "open", owner: null, target_date: "2025-09-01",
      },
    ]);
    const { resources } = getResource("iso27001-improvement-plan").listFn!();
    expect((resources[0] as { description: string }).description).toContain("2025-09-01");
  });

  it("omits owner and due date from description when both null", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "opp-1", title: "Automate patches", priority: "low",
        status: "open", owner: null, target_date: null,
      },
    ]);
    const { resources } = getResource("iso27001-improvement-plan").listFn!();
    const desc = (resources[0] as { description: string }).description;
    expect(desc).not.toContain("owner");
    expect(desc).not.toContain("due");
  });
});

// ── Read callback ─────────────────────────────────────────────

describe("iso27001-improvement-plan read callback", () => {
  it("returns opportunity JSON", async () => {
    mockStmt.get.mockReturnValue(OPP_ROW);
    const res = await getResource("iso27001-improvement-plan").readFn(
      new URL("iso27001://improvement-plan/opp-1"),
      { opportunity_id: "opp-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.id).toBe("opp-1");
    expect(data.title).toBe("Automate patch management");
    expect(data.priority).toBe("high");
    expect(data.source).toBe("internal_audit");
  });

  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(OPP_ROW);
    await getResource("iso27001-improvement-plan").readFn(
      new URL("iso27001://improvement-plan/opp-1"),
      { opportunity_id: "opp-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("throws when opportunity is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    expect(() =>
      getResource("iso27001-improvement-plan").readFn(
        new URL("iso27001://improvement-plan/missing"),
        { opportunity_id: "missing" },
        MOCK_EXTRA,
      )
    ).toThrow("Improvement opportunity not found");
  });
});
