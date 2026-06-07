/**
 * Unit tests for src/resources/evidence-templates.ts
 *
 * Covers: registerEvidenceDocumentResources
 *   - Registration count and list-callback presence
 *   - List callback: empty DB, known TEMPLATE_LABELS, unknown type fallback,
 *     all 6 known label keys
 *   - Read callback: auth call, JSON parsing (clause/control/template_vars),
 *     invalid template_vars graceful fallback, not-found error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const stmts = {
  list: { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
  read: { get: vi.fn(), all: vi.fn(() => [] as unknown[]) },
};

const mockDb = {
  prepare: vi.fn((sql: string) => {
    // "SELECT *" is used by the read callback; list uses a partial SELECT
    if (sql.includes("SELECT *")) return stmts.read;
    return stmts.list;
  }),
};

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

type ListFn  = () => { resources: unknown[] };
type ReadFn  = (uri: URL, vars: Record<string, string>, extra: unknown) => unknown;
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
  resource: vi.fn(
    (name: string, tpl: { _list?: ListFn }, _meta: unknown, readFn: ReadFn) => {
      captured.push({ name, listFn: tpl._list, readFn });
    },
  ),
};

import { registerEvidenceDocumentResources } from "../../../src/resources/evidence-templates.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  stmts.list.get.mockReturnValue(undefined);
  stmts.list.all.mockReturnValue([]);
  stmts.read.get.mockReturnValue(undefined);
  stmts.read.all.mockReturnValue([]);
  mockDb.prepare.mockImplementation((sql: string) => {
    if (sql.includes("SELECT *")) return stmts.read;
    return stmts.list;
  });
  registerEvidenceDocumentResources(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const BASE_ROW = {
  id:                "ev-1",
  template_type:     "access_review_attestation",
  title:             "Q4 Access Review",
  content:           "## Access Review\n\nAll users reviewed.",
  organisation_name: "Acme Corp",
  generated_by:      "admin",
  clause_mappings:   '["A.9.2"]',
  control_mappings:  '["5.15","5.16"]',
  template_vars:     '{"reviewer":"Jane","scope":"production"}',
  evidence_id:       "e-999",
  created_at:        "2025-06-01T12:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerEvidenceDocumentResources", () => {
  it("registers exactly one resource", () => {
    expect(captured).toHaveLength(1);
  });

  it("registers iso27001-evidence-document", () => {
    expect(captured[0].name).toBe("iso27001-evidence-document");
  });

  it("attaches a list callback", () => {
    expect(getResource("iso27001-evidence-document").listFn).toBeDefined();
  });
});

// ── list callback ─────────────────────────────────────────────

describe("iso27001-evidence-document list callback", () => {
  it("returns empty resources when the table is empty", () => {
    stmts.list.all.mockReturnValue([]);
    const result = getResource("iso27001-evidence-document").listFn!();
    expect(result.resources).toEqual([]);
  });

  it("maps a row with a known template_type to a human-readable label", () => {
    stmts.list.all.mockReturnValue([{
      id: "ev-1", template_type: "access_review_attestation",
      title: "Q4 Access Review", generated_by: "admin",
      evidence_id: null, created_at: "2025-06-01T12:00:00Z",
    }]);
    const result = getResource("iso27001-evidence-document").listFn!();
    const r = result.resources[0] as { uri: string; name: string; description: string; mimeType: string };
    expect(r.uri).toBe("iso27001://evidence-document/ev-1");
    expect(r.name).toBe("Q4 Access Review");
    expect(r.description).toContain("Access Review Attestation");
    expect(r.description).toContain("admin");
    expect(r.description).toContain("2025-06-01");
    expect(r.mimeType).toBe("application/json");
  });

  it("falls back to the raw template_type string for an unknown type", () => {
    stmts.list.all.mockReturnValue([{
      id: "ev-2", template_type: "custom_widget_report",
      title: "Custom", generated_by: "user",
      evidence_id: null, created_at: "2025-03-15T00:00:00Z",
    }]);
    const result = getResource("iso27001-evidence-document").listFn!();
    const r = result.resources[0] as { description: string };
    expect(r.description).toContain("custom_widget_report");
  });

  it("maps multiple rows correctly", () => {
    stmts.list.all.mockReturnValue([
      { id: "ev-1", template_type: "bcp_test_report", title: "BCP Test", generated_by: "g1", evidence_id: null, created_at: "2025-01-01T00:00:00Z" },
      { id: "ev-2", template_type: "incident_post_mortem", title: "Incident PM", generated_by: "g2", evidence_id: "e-1", created_at: "2025-02-01T00:00:00Z" },
    ]);
    const result = getResource("iso27001-evidence-document").listFn!();
    expect(result.resources).toHaveLength(2);
  });

  // Exercise all 6 TEMPLATE_LABELS keys to hit every branch in the ?? lookup
  it.each([
    ["access_review_attestation",       "Access Review Attestation"],
    ["training_acknowledgement",        "Training Acknowledgement"],
    ["supplier_security_questionnaire", "Supplier Security Questionnaire"],
    ["incident_post_mortem",            "Incident Post-Mortem"],
    ["bcp_test_report",                 "BCP Test Report"],
    ["risk_treatment_sign_off",         "Risk Treatment Sign-Off"],
  ])("uses label '%s' → '%s'", (type, label) => {
    stmts.list.all.mockReturnValue([{
      id: "ev-x", template_type: type, title: "T",
      generated_by: "g", evidence_id: null, created_at: "2025-01-01T00:00:00Z",
    }]);
    const result = getResource("iso27001-evidence-document").listFn!();
    const r = result.resources[0] as { description: string };
    expect(r.description).toContain(label);
  });
});

// ── read callback ─────────────────────────────────────────────

describe("iso27001-evidence-document read callback", () => {
  it("calls assertResourceAuth with extra before any DB access", () => {
    stmts.read.get.mockReturnValue(BASE_ROW);
    const uri = new URL("iso27001://evidence-document/ev-1");
    getResource("iso27001-evidence-document").readFn(uri, { document_id: "ev-1" }, MOCK_EXTRA);
    expect(mockAssertResourceAuth).toHaveBeenCalledOnce();
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns a ReadResourceResult with JSON content on success", () => {
    stmts.read.get.mockReturnValue(BASE_ROW);
    const uri = new URL("iso27001://evidence-document/ev-1");
    const result = getResource("iso27001-evidence-document").readFn(
      uri, { document_id: "ev-1" }, MOCK_EXTRA,
    ) as { contents: { uri: string; mimeType: string; text: string }[] };

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("iso27001://evidence-document/ev-1");
    expect(result.contents[0].mimeType).toBe("application/json");
  });

  it("parses clause_mappings and control_mappings via fromJsonArray", () => {
    stmts.read.get.mockReturnValue(BASE_ROW);
    const uri = new URL("iso27001://evidence-document/ev-1");
    const result = getResource("iso27001-evidence-document").readFn(
      uri, { document_id: "ev-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text);
    expect(Array.isArray(parsed.clause_mappings)).toBe(true);
    expect(Array.isArray(parsed.control_mappings)).toBe(true);
  });

  it("parses template_vars as an object when JSON is valid", () => {
    stmts.read.get.mockReturnValue({ ...BASE_ROW, template_vars: '{"key":"val"}' });
    const uri = new URL("iso27001://evidence-document/ev-1");
    const result = getResource("iso27001-evidence-document").readFn(
      uri, { document_id: "ev-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.template_vars).toEqual({ key: "val" });
  });

  it("returns {} for template_vars when the stored value is invalid JSON", () => {
    stmts.read.get.mockReturnValue({ ...BASE_ROW, template_vars: "not-json{{" });
    const uri = new URL("iso27001://evidence-document/ev-1");
    const result = getResource("iso27001-evidence-document").readFn(
      uri, { document_id: "ev-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.template_vars).toEqual({});
  });

  it("includes all scalar fields from the row in the payload", () => {
    stmts.read.get.mockReturnValue(BASE_ROW);
    const uri = new URL("iso27001://evidence-document/ev-1");
    const result = getResource("iso27001-evidence-document").readFn(
      uri, { document_id: "ev-1" }, MOCK_EXTRA,
    ) as { contents: { text: string }[] };
    const parsed = JSON.parse(result.contents[0].text) as Record<string, unknown>;
    expect(parsed["id"]).toBe("ev-1");
    expect(parsed["title"]).toBe("Q4 Access Review");
    expect(parsed["organisation_name"]).toBe("Acme Corp");
    expect(parsed["generated_by"]).toBe("admin");
  });

  it("throws with a descriptive message when document_id is not found", () => {
    stmts.read.get.mockReturnValue(undefined);
    const uri = new URL("iso27001://evidence-document/missing-doc");
    expect(() =>
      getResource("iso27001-evidence-document").readFn(
        uri, { document_id: "missing-doc" }, MOCK_EXTRA,
      ),
    ).toThrow("Evidence document not found: 'missing-doc'");
  });

  it("error message suggests using list_evidence_documents", () => {
    stmts.read.get.mockReturnValue(undefined);
    const uri = new URL("iso27001://evidence-document/x");
    expect(() =>
      getResource("iso27001-evidence-document").readFn(uri, { document_id: "x" }, MOCK_EXTRA),
    ).toThrow("list_evidence_documents");
  });
});
