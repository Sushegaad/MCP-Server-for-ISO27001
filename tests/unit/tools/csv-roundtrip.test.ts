/**
 * Unit + property tests for src/tools/csv-utils.ts and the
 * risk-register export → import round-trip.
 *
 * parseCsv — RFC 4180 tokenizer edge cases
 * csvCell  — quoting/escaping + OWASP formula-injection hardening
 * Round-trip: handleGenerateRiskRegister (csv) → handleImportRisks (dry_run)
 *             must be semantically lossless for every riskStatusEnum value,
 *             commas, quotes, newlines, UTF-8, empty optionals and
 *             related-control arrays.
 *
 * DB is fully mocked — no real SQLite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB module (shared by risks.ts and csv-import.ts) ──

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => [] as unknown[]),
  run: vi.fn(() => ({ changes: 1 })),
};
const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: () => unknown) => fn),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Import SUT after mock is registered ───────────────────────

import { parseCsv, csvCell } from "../../../src/tools/csv-utils.js";
import { handleGenerateRiskRegister } from "../../../src/tools/risks.js";
import { handleImportRisks } from "../../../src/tools/csv-import.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.all.mockReturnValue([]);
});

// ── parseCsv ──────────────────────────────────────────────────

describe("parseCsv", () => {
  it("splits plain rows and cells", () => {
    expect(parseCsv("a,b,c\nd,e,f")).toEqual([["a", "b", "c"], ["d", "e", "f"]]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,org\nalice,"Acme, Inc."')).toEqual([
      ["name", "org"],
      ["alice", "Acme, Inc."],
    ]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('"He said ""hi""",x')).toEqual([['He said "hi"', "x"]]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",b\nc,d')).toEqual([
      ["line1\nline2", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps CRLF inside quoted fields as literal characters", () => {
    expect(parseCsv('"a\r\nb",c')).toEqual([["a\r\nb", "c"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles empty cells", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([["a", "", "c"]]); // 2nd row fully empty → skipped
  });

  it("ignores a trailing newline (no phantom empty row)", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
  });

  it("skips blank lines between rows", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("handles UTF-8 content (émojis and CJK)", () => {
    expect(parseCsv('名前,值\n"café 🚀, oui",漢字')).toEqual([
      ["名前", "值"],
      ["café 🚀, oui", "漢字"],
    ]);
  });

  it("handles a quoted field at end of input without trailing newline", () => {
    expect(parseCsv('a,"b,c"')).toEqual([["a", "b,c"]]);
  });
});

// ── csvCell ───────────────────────────────────────────────────

describe("csvCell", () => {
  it("passes plain values through unchanged", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(42)).toBe("42");
  });

  it("serializes null/undefined as empty string", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing commas", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("escapes embedded quotes and wraps in quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines and carriage returns", () => {
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell("\rx")).toBe("\"'\rx\""); // CR at cell start is a formula trigger too
  });

  it("prefix-escapes spreadsheet formula triggers with an apostrophe", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
  });

  it("handles a formula trigger AND a comma together (escaped then quoted)", () => {
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
  });

  it("round-trips through parseCsv for non-trigger values", () => {
    const values = ["plain", "a,b", 'say "hi"', "multi\nline", "café 🚀", ""];
    const line   = values.map(csvCell).join(",");
    expect(parseCsv(line)).toEqual([values]);
  });
});

// ── export → import round-trip ────────────────────────────────

interface SourceRisk {
  id: string;
  asset: string;
  threat: string;
  vulnerability: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  risk_level: string;
  owner: string | null;
  status: string;
  related_controls: string | null; // JSON string, as stored in the DB
  created_at: string;
  updated_at: string;
  treatment_types: string | null;  // group_concat output
}

/** One row per riskStatusEnum value, exercising commas, quotes, newlines,
 *  UTF-8, empty optionals and related-control arrays. */
const SOURCE_RISKS: SourceRisk[] = [
  {
    id: "risk-1",
    asset: 'Acme, Inc. "Primary" customer DB',
    threat: "SQL injection, via legacy ORM",
    vulnerability: "Unparameterised queries",
    likelihood: 4, impact: 5, risk_score: 20, risk_level: "Critical",
    owner: "Head of Eng",
    status: "open",
    related_controls: '["8.28","8.20"]',
    created_at: "2026-01-01 00:00:00Z", updated_at: "2026-01-01 00:00:00Z",
    treatment_types: "mitigate,transfer",
  },
  {
    id: "risk-2",
    asset: "Laptop fleet",
    threat: "Theft or loss\nduring travel",
    vulnerability: "No full-disk encryption",
    likelihood: 3, impact: 4, risk_score: 12, risk_level: "High",
    owner: null, // empty optional owner
    status: "accepted",
    related_controls: null, // empty controls array
    created_at: "2026-01-01 00:00:00Z", updated_at: "2026-01-01 00:00:00Z",
    treatment_types: null,
  },
  {
    id: "risk-3",
    asset: "café-orders 🚀 service",
    threat: "資格情報の窃取 (credential theft)",
    vulnerability: 'Shared "admin" account',
    likelihood: 2, impact: 3, risk_score: 6, risk_level: "Medium",
    owner: "Sécurité, Équipe",
    status: "mitigated",
    related_controls: '["5.17"]',
    created_at: "2026-01-01 00:00:00Z", updated_at: "2026-01-01 00:00:00Z",
    treatment_types: "mitigate",
  },
  {
    id: "risk-4",
    asset: "Payroll SaaS",
    threat: "Vendor breach",
    vulnerability: "Third-party processing of PII, incl. bank details",
    likelihood: 2, impact: 5, risk_score: 10, risk_level: "High",
    owner: "CFO",
    status: "transferred",
    related_controls: '["5.19","5.20","5.21"]',
    created_at: "2026-01-01 00:00:00Z", updated_at: "2026-01-01 00:00:00Z",
    treatment_types: "transfer",
  },
  {
    id: "risk-5",
    asset: "Legacy FTP server",
    threat: "Eavesdropping",
    vulnerability: "Cleartext protocol",
    likelihood: 1, impact: 2, risk_score: 2, risk_level: "Low",
    owner: "IT Ops",
    status: "closed",
    related_controls: '["8.24"]',
    created_at: "2026-01-01 00:00:00Z", updated_at: "2026-01-01 00:00:00Z",
    treatment_types: "avoid",
  },
];

describe("risk register export → import round-trip", () => {
  it("exported CSV re-imports with semantically identical fields for every status value", () => {
    mockStmt.all.mockReturnValue(SOURCE_RISKS);

    // 1. Export
    const exported = handleGenerateRiskRegister({ format: "csv" });
    expect(exported.isError).toBe(false);
    const csv = (JSON.parse(exported.content[0].text) as { content: string }).content;

    // Header carries the round-trip columns
    const header = csv.split("\n")[0];
    expect(header).toBe(
      "id,asset,threat,vulnerability,likelihood,impact,risk_score,risk_level,status,owner,treatment_types,related_controls",
    );

    // 2. Import (dry_run — validation + preview, no DB writes)
    const imported = handleImportRisks({ csv_content: csv, dry_run: true });
    expect(imported.isError).toBe(false);
    const data = JSON.parse(imported.content[0].text) as {
      dry_run: boolean;
      valid_rows: number;
      error_rows: number;
      preview: Array<Record<string, unknown>>;
    };

    expect(data.dry_run).toBe(true);
    expect(data.error_rows).toBe(0);
    expect(data.valid_rows).toBe(SOURCE_RISKS.length);
    expect(data.preview).toHaveLength(SOURCE_RISKS.length);

    for (let i = 0; i < SOURCE_RISKS.length; i++) {
      const src = SOURCE_RISKS[i];
      const got = data.preview[i];
      expect(got["asset"]).toBe(src.asset);
      expect(got["threat"]).toBe(src.threat);
      expect(got["vulnerability"]).toBe(src.vulnerability);
      expect(got["likelihood"]).toBe(src.likelihood);
      expect(got["impact"]).toBe(src.impact);
      expect(got["owner"]).toBe(src.owner ?? "");
      expect(got["status"]).toBe(src.status); // every riskStatusEnum value survives
      const srcControls = src.related_controls
        ? (JSON.parse(src.related_controls) as string[])
        : [];
      expect(got["related_controls"]).toEqual(srcControls);
    }
  });

  it("exported CSV cells never start with a raw formula trigger", () => {
    mockStmt.all.mockReturnValue([
      {
        ...SOURCE_RISKS[0],
        asset: "=HYPERLINK(\"http://evil\")",
        threat: "+ACK",
        vulnerability: "@import",
        owner: "-owner",
      },
    ]);
    const exported = handleGenerateRiskRegister({ format: "csv" });
    const csv = (JSON.parse(exported.content[0].text) as { content: string }).content;
    const dataRows = parseCsv(csv).slice(1);
    for (const row of dataRows) {
      for (const cell of row) {
        expect(cell).not.toMatch(/^[=+\-@\t]/);
      }
    }
  });
});
