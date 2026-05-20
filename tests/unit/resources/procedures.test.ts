/**
 * Unit tests for src/resources/procedures.ts
 *
 * Covers: registerProcedureResources — list and read callbacks for
 * iso27001-procedure and iso27001-procedure-versioned.
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

import { registerProcedureResources } from "../../../src/resources/procedures.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.all.mockReturnValue([]);
  mockStmt.get.mockReturnValue(undefined);
  registerProcedureResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const PROCEDURE_ROW = {
  id: "proc-1", procedure_type: "incident_handling",
  policy_id: "pol-1", organisation_name: "Acme Ltd",
  scope: "All systems", owner: "CISO", approver: "CTO",
  status: "active", version: 1, content: "# Incident Handling\nContent",
  clause_mappings: '["6.1"]', control_mappings: '["5.24"]',
  related_controls: '["5.25","5.26"]',
  review_cycle_months: 12, effective_date: "2025-01-01",
  next_review_date: "2026-01-01", reviewed_by: null,
  approved_by: null, created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerProcedureResources", () => {
  it("registers two resources", () => {
    expect(captured).toHaveLength(2);
  });

  it("registers iso27001-procedure with a list callback", () => {
    expect(getResource("iso27001-procedure").listFn).toBeDefined();
  });

  it("registers iso27001-procedure-versioned without a list callback", () => {
    expect(getResource("iso27001-procedure-versioned").listFn).toBeUndefined();
  });
});

// ── iso27001-procedure list ───────────────────────────────────

describe("iso27001-procedure list callback", () => {
  it("returns empty resources when no procedures exist", () => {
    mockStmt.all.mockReturnValue([]);
    const { resources } = getResource("iso27001-procedure").listFn!();
    expect(resources).toHaveLength(0);
  });

  it("maps procedure rows to resource entries with correct URI", () => {
    mockStmt.all.mockReturnValue([
      {
        id: "proc-1", procedure_type: "incident_handling",
        organisation_name: "Acme Ltd", version: 1,
        status: "active", effective_date: "2025-01-01",
      },
    ]);
    const { resources } = getResource("iso27001-procedure").listFn!();
    expect(resources).toHaveLength(1);
    expect((resources[0] as { uri: string }).uri).toBe("iso27001://procedure/proc-1");
    expect((resources[0] as { mimeType: string }).mimeType).toBe("text/markdown");
    expect((resources[0] as { name: string }).name).toContain("incident_handling");
    expect((resources[0] as { name: string }).name).toContain("v1");
  });
});

// ── iso27001-procedure read ───────────────────────────────────

describe("iso27001-procedure read callback", () => {
  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(PROCEDURE_ROW);
    await getResource("iso27001-procedure").readFn(
      new URL("iso27001://procedure/proc-1"),
      { procedure_id: "proc-1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns Markdown with YAML frontmatter including procedure_type and policy_id", async () => {
    mockStmt.get.mockReturnValue(PROCEDURE_ROW);
    const res = await getResource("iso27001-procedure").readFn(
      new URL("iso27001://procedure/proc-1"),
      { procedure_id: "proc-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("text/markdown");
    const text = res.contents[0].text;
    expect(text).toContain("---");
    expect(text).toContain("uri: iso27001://procedure/proc-1");
    expect(text).toContain("procedure_type: incident_handling");
    expect(text).toContain('policy_id: "pol-1"');
    expect(text).toContain("# Incident Handling");
  });

  it("renders empty policy_id when null", async () => {
    mockStmt.get.mockReturnValue({ ...PROCEDURE_ROW, policy_id: null, approver: null });
    const res = await getResource("iso27001-procedure").readFn(
      new URL("iso27001://procedure/proc-1"),
      { procedure_id: "proc-1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    expect(res.contents[0].text).toContain('policy_id: ""');
    expect(res.contents[0].text).toContain('approver: "TBD"');
  });

  it("throws when procedure is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-procedure").readFn(
        new URL("iso27001://procedure/missing"),
        { procedure_id: "missing" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Procedure not found");
  });
});

// ── iso27001-procedure-versioned read ─────────────────────────

describe("iso27001-procedure-versioned read callback", () => {
  const VERSION_ROW = {
    id: "pv-1", procedure_id: "proc-1", version: 1,
    content: "# Old Procedure\nOld content",
    change_summary: "First draft",
    reviewed_by: null,
    archived_at: "2025-06-01T00:00:00Z",
  };

  it("returns Markdown with version frontmatter", async () => {
    mockStmt.get.mockReturnValue(VERSION_ROW);
    const res = await getResource("iso27001-procedure-versioned").readFn(
      new URL("iso27001://procedure/proc-1/version/1"),
      { procedure_id: "proc-1", version: "1" },
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const text = res.contents[0].text;
    expect(text).toContain("uri: iso27001://procedure/proc-1/version/1");
    expect(text).toContain('change_summary: "First draft"');
    expect(text).toContain("# Old Procedure");
  });

  it("throws for non-numeric version", async () => {
    await expect(
      getResource("iso27001-procedure-versioned").readFn(
        new URL("iso27001://procedure/proc-1/version/latest"),
        { procedure_id: "proc-1", version: "latest" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Invalid version");
  });

  it("throws for version zero", async () => {
    await expect(
      getResource("iso27001-procedure-versioned").readFn(
        new URL("iso27001://procedure/proc-1/version/0"),
        { procedure_id: "proc-1", version: "0" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Invalid version");
  });

  it("throws when version row is not found", async () => {
    mockStmt.get.mockReturnValue(undefined);
    await expect(
      getResource("iso27001-procedure-versioned").readFn(
        new URL("iso27001://procedure/proc-1/version/99"),
        { procedure_id: "proc-1", version: "99" },
        MOCK_EXTRA,
      ),
    ).rejects.toThrow("Procedure version not found");
  });

  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(VERSION_ROW);
    await getResource("iso27001-procedure-versioned").readFn(
      new URL("iso27001://procedure/proc-1/version/1"),
      { procedure_id: "proc-1", version: "1" },
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalled();
  });
});
