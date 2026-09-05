/**
 * iso27001-mcp — ARD publishing generator
 *
 * Generates the Agentic Resource Discovery (ARD v0.91) publishing artefacts
 * from the single sources of truth so they can never drift:
 *
 *   docs/server-card.json   — MCP server card (server.json + tool registry + version)
 *   docs/ard.json           — ARD manifest (the discoverable entry)
 *   docs/index.html         — refreshes the in-page JSON-LD block between
 *                             <!-- ARD-JSONLD-START --> / <!-- ARD-JSONLD-END -->
 *   wellknown-site/.well-known/ard.json — copy for the user-site repo (Phase 3)
 *
 * Run: npx tsx scripts/generate-ard.ts   (wired into `npm run postbuild`)
 * Spec: https://agenticresourcediscovery.org/spec/
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../src/tools/registry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
  description: string;
};
const serverJson = JSON.parse(readFileSync(join(root, "server.json"), "utf8")) as Record<string, unknown>;

// Full ISO 8601 date-time — the ARD entry schema requires `format: date-time`
// for `updatedAt`; a bare date would fail format-aware validation.
const today = new Date().toISOString();

// ── 1. Server card ────────────────────────────────────────────
// The artifact the ARD entry's `url` points at: the MCP-registry manifest
// enriched with a tool summary derived from the unified registry.

const serverCard = {
  ...serverJson,
  version: pkg.version,
  updatedAt: today,
  toolCount: TOOLS.length,
  tools: TOOLS.map((t) => ({
    name:        t.name,
    description: t.description,
    minRole:     t.minRole,
    ...(t.annotations ? { annotations: t.annotations } : {}),
  })),
};

writeFileSync(join(root, "docs", "server-card.json"), JSON.stringify(serverCard, null, 2) + "\n");

// ── 2. ARD entry + manifest ───────────────────────────────────

const entry = {
  "@context": "https://agenticresourcediscovery.org/context/v1",
  identifier: "urn:air:sushegaad.github.io:server:iso27001-mcp",
  displayName: "iso27001-mcp — ISO 27001 Compliance Workspace",
  type: "application/mcp-server-card+json",
  url: "https://sushegaad.github.io/MCP-Server-for-ISO27001/server-card.json",
  description:
    "Stateful ISO 27001:2022 ISMS MCP server: 56 tools across gap assessment, risk register and " +
    "governance, Statement of Applicability, policies and procedures, evidence with independent " +
    "verification, internal audits, and Clause 9.3 management review — backed by an AES-256 " +
    "encrypted local SQLite database with human-in-the-loop gated writes and a tamper-evident audit log.",
  capabilities: [
    "GapAssessment", "RiskRegister", "RiskGovernance", "RiskAcceptance",
    "StatementOfApplicability", "PolicyGeneration", "ProcedureGeneration",
    "EvidenceTracking", "EvidenceVerification", "InternalAudit",
    "CorrectiveActions", "ManagementReview", "ImprovementPlan", "CsvImport",
  ],
  representativeQueries: [
    "run an ISO 27001 gap assessment for my company",
    "generate a Statement of Applicability for ISO 27001:2022",
    "create a risk register with treatment plans and risk-owner acceptance",
    "prepare our ISO 27001 internal audit and record findings",
    "track evidence for our ISO 27001 certification",
  ],
  tags: ["iso27001", "isms", "grc", "compliance", "risk-management", "audit", "security"],
  version: pkg.version,
  updatedAt: today,
};

const manifest = { entries: [entry] };
const manifestJson = JSON.stringify(manifest, null, 2) + "\n";

writeFileSync(join(root, "docs", "ard.json"), manifestJson);

// Phase 3 copy for the Sushegaad/sushegaad.github.io user-site repo
mkdirSync(join(root, "wellknown-site", ".well-known"), { recursive: true });
writeFileSync(join(root, "wellknown-site", ".well-known", "ard.json"), manifestJson);

// ── 3. In-page JSON-LD block in docs/index.html ───────────────

const indexPath = join(root, "docs", "index.html");
const html = readFileSync(indexPath, "utf8");
const START = "<!-- ARD-JSONLD-START -->";
const END   = "<!-- ARD-JSONLD-END -->";
const block =
  `${START}\n  <script type="application/ld+json">\n${JSON.stringify(entry, null, 2)}\n  </script>\n  ${END}`;

const startIdx = html.indexOf(START);
const endIdx   = html.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error("[ard] ARD-JSONLD markers not found in docs/index.html — skipping HTML injection.");
  console.error("[ard] Add the markers inside <head> to enable in-page markup.");
} else if (endIdx <= startIdx) {
  // Malformed markers (END before START) would slice the HTML incorrectly
  // and corrupt docs/index.html — fail loud instead of writing garbage.
  console.error("[ard] ARD-JSONLD END marker appears before START in docs/index.html — aborting.");
  process.exit(1);
} else {
  const updated = html.slice(0, startIdx) + block + html.slice(endIdx + END.length);
  writeFileSync(indexPath, updated);
}

console.error(
  `[ard] Generated: docs/server-card.json (${TOOLS.length} tools), docs/ard.json, ` +
  `wellknown-site/.well-known/ard.json, index.html JSON-LD — version ${pkg.version}, updated ${today}`,
);
