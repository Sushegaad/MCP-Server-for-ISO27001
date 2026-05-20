/**
 * Unit tests for src/resources/policies.ts
 *
 * Covers: registerPolicyResources — list and read callbacks for
 * iso27001-policy and iso27001-policy-versioned.
 * Both require viewer auth (assertResourceAuth mocked).
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

import { registerPolicyResources } from "../../../src/resources/policies.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.all.mockReturnValue([]);
  mockStmt.get.mockReturnValue(undefined);
  registerPolicyResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const POLICY_ROW = {
  id: "pol-1", type: "Information Security Policy",
  organisation_name: "Acme Ltd", scope: "All systems",
  owner: "CISO", approver: "CEO", status: "active",
  version: 2, content: "# Policy\nContent here",
  clause_mappings: '["4.1","4.2"]', control_mappings: '["5.1"]',
  review_cycle_months: 12, effective_date: "2025-01-01",
  next_review_date: "2026-01-01", reviewed_by: "Alice",
  approved_by: "Bob", created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerPolicyResources", () => {
  it("registers two resources", () => {
    expect(captured).toHaveLength(2);
  });

  it("registers iso27001-policy with a list callback", () => {
    expect(getResource("iso27001-policy").listFn).toBeDefined();
  });

  it("registers iso27001-policy-versioned without a list callback", () => {
    expect(getResource("iso27001-policy-versioned").listFn).toBeUndefined();
  });
});

// ── iso27001-policy list ──────────────────────────────────────

describe("iso27001-policy list callback", () => {
  it("returns empty resources when no policies exist", () => {
    mockStmt.all.mockReturnValue([]);
    const { resources } = getResource("iso27001-policy").listFn!();
    expect(resources).toHaveLength(0);
  });

  it("maps policy rows to resource entries", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "pol-1", type: "Information Security Policy",
        organisation_name: "Acme Ltd", version: 2,
        status: "active", effective_date: "2025-01-01",
      },
    ]);
    const { resources } = getResource("iso27001-policy").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://policy/pol-1");
    expect((resources[0] as { mimeType: string }).mimeType).toBe("text/markdown");
    expect((resources[0] as { name: string }).name).toContain("v2");
  });
});

// ── iso27001-policy read ──────────────────────────────────────

describe("iso27001-policy read callback", () => {
  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(POLICY_ROW);
    await getResource("iso27001-policy").readFn(
      new URL("iso27001://policy/pol-1"),
      { policy_id: "pol-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns Markdown with YAML frontmatter for valid policy", async () => {
    mockStmt.get.mockReturnValue(POLICY_ROW);
    const res = await getResource("iso27001-policy").readFn(
      new URL("iso27001://policy/pol-1"),
      { policy_id: "pol-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("text/markdown");
    const text = res.contents[0].text;
    expect(text).toContain("---");
    expect(text).toContain("uri: iso27001://policy/pol-1");
    expect(text).toContain("version: 2");
    expect(text).toContain("organisation_name: \"Acme Ltd\"");
    expect(text).toContain("# Policy");
  });

  it("includes approver TBD when approver is null", async () => {
    mockStmt.get.mockReturnValue({ ...POLICY_ROW, approver: null });
    const res = await getResource("iso27001-policy").readFn(
      new URL("iso27001://policy/pol-1"),
      { policy_id: "pol-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    expect(res.contents[0].text).toContain('approver: "TBD"');
  });

  it("throws when policy is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-policy").readFn(
        new URL("iso27001://policy/missing"),
        { policy_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Policy not found");
  });
});

// ── iso27001-policy-versioned read ────────────────────────────

describe("iso27001-policy-versioned read callback", () => {
  const VERSION_ROW = {
    id: "pv-1", policy_id: "pol-1", version: 1,
    content: "# Old Policy\nOld content",
    change_summary: "Initial version",
    reviewed_by: "Alice", approved_by: null,
    archived_at: "2025-06-01T00:00:00Z",
  };

  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(VERSION_ROW);
    await getResource("iso27001-policy-versioned").readFn(
      new URL("iso27001://policy/pol-1/version/1"),
      { policy_id: "pol-1", version: "1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalled();
  });

  it("returns Markdown with version frontmatter", async () => {
    mockStmt.get.mockReturnValue(VERSION_ROW);
    const res = await getResource("iso27001-policy-versioned").readFn(
      new URL("iso27001://policy/pol-1/version/1"),
      { policy_id: "pol-1", version: "1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const text = res.contents[0].text;
    expect(text).toContain("uri: iso27001://policy/pol-1/version/1");
    expect(text).toContain("version: 1");
    expect(text).toContain("change_summary: \"Initial version\"");
    expect(text).toContain("# Old Policy");
  });

  it("throws for invalid version format", async () => {
    await expect(
      getResource("iso27001-policy-versioned").readFn(
        new URL("iso27001://policy/pol-1/version/abc"),
        { policy_id: "pol-1", version: "abc" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Invalid version");
  });

  it("throws for version zero", async () => {
    await expect(
      getResource("iso27001-policy-versioned").readFn(
        new URL("iso27001://policy/pol-1/version/0"),
        { policy_id: "pol-1", version: "0" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Invalid version");
  });

  it("throws when version row is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-policy-versioned").readFn(
        new URL("iso27001://policy/pol-1/version/99"),
        { policy_id: "pol-1", version: "99" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Policy version not found");
  });
});
