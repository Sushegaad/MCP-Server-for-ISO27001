/**
 * Unit tests for src/resources/controls.ts
 *
 * Covers: registerControlResources — list and read callbacks for all
 * three resource templates (iso27001-control, iso27001-control-versioned,
 * iso27001-clause). Controls/clauses are public (no auth).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
};
const mockDb = { prepare: vi.fn(() => mockStmt) };

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../src/db/dal.js", () => ({
  fromJsonArray: vi.fn((raw: string | null) =>
    raw ? (JSON.parse(raw) as unknown[]) : [],
  ),
}));

// Capture ResourceTemplate list callbacks
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

// SUT import
import { registerControlResources } from "../../../src/resources/controls.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.all.mockReturnValue([]);
  mockStmt.get.mockReturnValue(undefined);
  registerControlResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

// ── Registration ──────────────────────────────────────────────

describe("registerControlResources", () => {
  it("registers three resources", () => {
    expect(captured).toHaveLength(3);
  });

  it("registers iso27001-control with a list callback", () => {
    expect(getResource("iso27001-control").listFn).toBeDefined();
  });

  it("registers iso27001-control-versioned without a list callback", () => {
    expect(getResource("iso27001-control-versioned").listFn).toBeUndefined();
  });

  it("registers iso27001-clause with a list callback", () => {
    expect(getResource("iso27001-clause").listFn).toBeDefined();
  });
});

// ── iso27001-control list ─────────────────────────────────────

describe("iso27001-control list callback", () => {
  it("returns empty resources when no controls exist", () => {
    mockStmt.all.mockReturnValue([]);
    const { resources } = getResource("iso27001-control").listFn!();
    expect(resources).toHaveLength(0);
  });

  it("maps control rows to resource entries", () => {
    mockStmt.all.mockReturnValue([
      { control_id: "5.1", name: "Policy", theme: "Organisational", description: "A policy desc" },
    ]);
    const { resources } = getResource("iso27001-control").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://control/5.1");
    expect((resources[0] as { name: string }).name).toBe("5.1 — Policy");
    expect((resources[0] as { mimeType: string }).mimeType).toBe("application/json");
  });

  it("truncates long descriptions to 150 chars plus ellipsis", () => {
    const longDesc = "x".repeat(200);
    mockStmt.all.mockReturnValue([
      { control_id: "5.1", name: "Policy", theme: "Org", description: longDesc },
    ]);
    const { resources } = getResource("iso27001-control").listFn!();
    const desc = (resources[0] as { description: string }).description;
    expect(desc.length).toBeLessThanOrEqual(154); // 150 + "…"
    expect(desc.endsWith("…")).toBe(true);
  });
});

// ── iso27001-control read ─────────────────────────────────────

describe("iso27001-control read callback", () => {
  const CONTROL_ROW = {
    id: "row1", control_id: "5.1", version: "2022", name: "Policy",
    theme: "Organisational", description: "Desc", guidance: null,
    control_type: '["preventive"]', attributes: null,
    related_controls: '["5.2"]', new_in_2022: 0,
    iso_clause_refs: '["5.1"]', created_at: "2025-01-01T00:00:00Z",
  };

  it("returns control JSON for a valid control_id", async () => {
    mockStmt.get.mockReturnValue(CONTROL_ROW);
    const res = await getResource("iso27001-control").readFn(
      new URL("iso27001://control/5.1"),
      { control_id: "5.1" },
      {},
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.control_id).toBe("5.1");
    expect(data.new_in_2022).toBe(false);  // 0 → false
    expect(data.control_type).toEqual(["preventive"]);
  });

  it("throws when control is not found", () => {
    mockStmt.get.mockReturnValue(undefined);
    expect(() =>
      getResource("iso27001-control").readFn(
        new URL("iso27001://control/99.99"),
        { control_id: "99.99" },
        {},
      )
    ).toThrow("Control not found");
  });
});

// ── iso27001-control-versioned read ───────────────────────────

describe("iso27001-control-versioned read callback", () => {
  it("returns control JSON for a valid control_id and version", async () => {
    const row = {
      id: "row2", control_id: "5.1", version: "2022", name: "Policy",
      theme: "Org", description: "Desc", guidance: null,
      control_type: '["preventive"]', attributes: '{"security_domains":["Governance"]}',
      related_controls: null, new_in_2022: 1,
      iso_clause_refs: null, created_at: "2025-01-01T00:00:00Z",
    };
    mockStmt.get.mockReturnValue(row);
    const res = await getResource("iso27001-control-versioned").readFn(
      new URL("iso27001://control/5.1/version/2022"),
      { control_id: "5.1", version: "2022" },
      {},
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.new_in_2022).toBe(true);
    expect(data.attributes).toEqual({ security_domains: ["Governance"] });
  });

  it("throws for unknown version", () => {
    mockStmt.get.mockReturnValue(undefined);
    expect(() =>
      getResource("iso27001-control-versioned").readFn(
        new URL("iso27001://control/5.1/version/2015"),
        { control_id: "5.1", version: "2015" },
        {},
      )
    ).toThrow("Control not found");
  });
});

// ── iso27001-clause list ──────────────────────────────────────

describe("iso27001-clause list callback", () => {
  it("maps clause rows to resource entries", () => {
    mockStmt.all.mockReturnValue([
      { clause_id: "4.1", title: "Understanding the organisation" },
      { clause_id: "4.2", title: "Interested parties" },
    ]);
    const { resources } = getResource("iso27001-clause").listFn!();
    expect(resources).toHaveLength(2);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://clause/4.1");
    expect((resources[0] as { name: string }).name).toContain("4.1");
  });
});

// ── iso27001-clause read ──────────────────────────────────────

describe("iso27001-clause read callback", () => {
  it("returns clause JSON for a valid clause_id", async () => {
    const row = {
      id: "c1", clause_id: "4.1", parent_id: null,
      title: "Understanding", requirement_text: "The org shall...",
      implementation_notes: null, related_controls: '["5.1"]',
      created_at: "2025-01-01T00:00:00Z",
    };
    mockStmt.get.mockReturnValue(row);
    const res = await getResource("iso27001-clause").readFn(
      new URL("iso27001://clause/4.1"),
      { clause_id: "4.1" },
      {},
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.clause_id).toBe("4.1");
    expect(data.related_controls).toEqual(["5.1"]);
  });

  it("throws when clause is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    expect(() =>
      getResource("iso27001-clause").readFn(
        new URL("iso27001://clause/99"),
        { clause_id: "99" },
        {},
      )
    ).toThrow("Clause not found");
  });
});
