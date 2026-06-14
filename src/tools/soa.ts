/**
 * iso27001-mcp — Group 5: Statement of Applicability handlers
 *
 * generate_soa, update_soa_entry, export_soa
 */

import { getDb } from "../db/connection.js";
import { newId, now, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";
import { renderHtmlDocument } from "./template-utils.js";
import { buildDiffTable, type DiffRow } from "./hitl-utils.js";

// ── Types ─────────────────────────────────────────────────────

interface SoaRow {
  id: string;
  assessment_id: string;
  isms_version: string;
  created_at: string;
  updated_at: string;
}

interface SoaEntryRow {
  id: string;
  soa_id: string;
  control_id: string;
  included: number;      // 0|1
  justification: string;
  status: string | null;
  evidence_count: number;
  responsible_party: string | null;
  created_at: string;
  updated_at: string;
}

interface ControlRow {
  control_id: string;
  name: string;
  theme: string;
  description: string;
  exclude_controls?: string | null;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── generate_soa ──────────────────────────────────────────────

export function handleGenerateSoa(args: Record<string, unknown>): ToolResult {
  const { assessment_id, isms_version = "2022" } = args as {
    assessment_id: string; isms_version?: string;
  };

  const db = getDb();

  // Check assessment exists
  const assessment = db.prepare("SELECT * FROM gap_assessments WHERE id = ?").get(assessment_id) as
    { id: string; name: string; exclude_controls: string | null; themes_in_scope: string | null } | undefined;
  if (!assessment) throw notFound("gap_assessment", assessment_id);

  // Check no existing SoA for this assessment
  const existing = db.prepare("SELECT id FROM soa WHERE assessment_id = ?").get(assessment_id) as
    { id: string } | undefined;
  if (existing) {
    throw businessRule("soa", `A Statement of Applicability already exists for this assessment (id: ${existing.id}). Use update_soa_entry to modify entries.`);
  }

  // Create the SoA record
  const soaId = newId();
  const ts    = now();

  db.prepare(`
    INSERT INTO soa (id, assessment_id, isms_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(soaId, assessment_id, isms_version, ts, ts);

  // Load all controls for this version
  const excludedIds   = fromJsonArray<string>(assessment.exclude_controls);
  const themesInScope = fromJsonArray<string>(assessment.themes_in_scope);

  let controlQuery = "SELECT control_id, name, theme, description FROM controls WHERE version = ?";
  const controlParams: unknown[] = [isms_version];

  if (themesInScope.length > 0) {
    controlQuery += ` AND theme IN (${themesInScope.map(() => "?").join(",")})`;
    controlParams.push(...themesInScope);
  }
  controlQuery += " ORDER BY control_id";

  const controls = db.prepare(controlQuery).all(...controlParams) as ControlRow[];

  // Load existing gap statuses for context
  const statusRows = db.prepare(
    "SELECT control_id, status FROM control_statuses WHERE assessment_id = ?"
  ).all(assessment_id) as { control_id: string; status: string }[];
  const statusMap = new Map(statusRows.map((s) => [s.control_id, s.status]));

  // Insert one SoA entry per control
  const insertEntry = db.prepare(`
    INSERT INTO soa_entries
      (id, soa_id, control_id, included, justification, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const ctrl of controls) {
      const isExcluded  = excludedIds.includes(ctrl.control_id);
      const gapStatus   = statusMap.get(ctrl.control_id);
      const included    = isExcluded ? 0 : 1;
      const justification = isExcluded
        ? "Excluded from assessment scope."
        : (gapStatus === "na" ? "Not applicable to organisational scope." : "In scope per ISMS boundary.");

      insertEntry.run(
        newId(), soaId, ctrl.control_id, included,
        justification, gapStatus ?? null, ts, ts,
      );
    }
  });

  insertMany();

  const entryCount = controls.length;
  const includedCount = controls.filter((c) => !excludedIds.includes(c.control_id)).length;

  return ok({
    soa_id:          soaId,
    assessment_id,
    isms_version,
    total_controls:  entryCount,
    included:        includedCount,
    excluded:        entryCount - includedCount,
    created_at:      ts,
  });
}

// ── update_soa_entry ──────────────────────────────────────────

export function handleUpdateSoaEntry(args: Record<string, unknown>): ToolResult {
  const {
    soa_id, control_id, included, justification,
    status, responsible_party, confirmed = false,
  } = args as {
    soa_id: string; control_id: string; included: boolean;
    justification: string; status?: string; responsible_party?: string;
    confirmed?: boolean;
  };

  const db = getDb();

  // Confirm SoA exists
  const soa = db.prepare("SELECT id FROM soa WHERE id = ?").get(soa_id) as { id: string } | undefined;
  if (!soa) throw notFound("soa", soa_id);

  // Find the entry (full row for diff)
  const entry = db.prepare(
    "SELECT * FROM soa_entries WHERE soa_id = ? AND control_id = ?"
  ).get(soa_id, control_id) as SoaEntryRow | undefined;
  if (!entry) throw notFound("soa_entry", `${soa_id}/${control_id}`);

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [];
    const newIncluded = included ? 1 : 0;
    if (newIncluded !== entry.included)
      rows.push({ field: "included", old: entry.included === 1 ? "Yes" : "No", new: included ? "Yes" : "No" });
    if (justification !== entry.justification)
      rows.push({ field: "justification", old: entry.justification, new: justification });
    if (status !== undefined && status !== entry.status)
      rows.push({ field: "status", old: entry.status, new: status });
    if (responsible_party !== undefined && responsible_party !== entry.responsible_party)
      rows.push({ field: "responsible_party", old: entry.responsible_party, new: responsible_party });
    return ok({
      hitl_proposed: true,
      status:        "preview",
      soa_id,
      control_id,
      message:       "⏸ No data written. Pass \"confirmed\": true to apply this change.",
      diff:          buildDiffTable(rows),
    });
  }

  const ts = now();
  db.prepare(`
    UPDATE soa_entries SET
      included          = ?,
      justification     = ?,
      status            = COALESCE(?, status),
      responsible_party = COALESCE(?, responsible_party),
      updated_at        = ?
    WHERE id = ?
  `).run(
    included ? 1 : 0, justification,
    status ?? null, responsible_party ?? null,
    ts, entry.id,
  );

  // Update parent SoA updated_at
  db.prepare("UPDATE soa SET updated_at = ? WHERE id = ?").run(ts, soa_id);

  return ok({
    soa_id,
    control_id,
    included,
    justification,
    status:            status ?? null,
    responsible_party: responsible_party ?? null,
    updated_at:        ts,
  });
}

// ── export_soa ────────────────────────────────────────────────

export function handleExportSoa(args: Record<string, unknown>): ToolResult {
  const { soa_id, format } = args as { soa_id: string; format: string };

  const db  = getDb();
  const soa = db.prepare("SELECT * FROM soa WHERE id = ?").get(soa_id) as SoaRow | undefined;
  if (!soa) throw notFound("soa", soa_id);

  const entries = db.prepare(`
    SELECT se.*, c.name AS control_name, c.theme, c.description
    FROM soa_entries se
    LEFT JOIN controls c ON c.control_id = se.control_id AND c.version = ?
    WHERE se.soa_id = ?
    ORDER BY se.control_id
  `).all(soa.isms_version, soa_id) as Array<SoaEntryRow & {
    control_name: string | null; theme: string | null; description: string | null;
  }>;

  const includedCount = entries.filter((e) => e.included === 1).length;
  const excludedCount = entries.filter((e) => e.included === 0).length;

  const ORG_PROFILE_ID_SOA = "00000000-0000-4000-8000-000000000001";

  if (format === "html") {
    const profileRow = db.prepare(
      "SELECT legal_entity_name, logo_url, primary_color, document_footer FROM organization_profile WHERE id = ?"
    ).get(ORG_PROFILE_ID_SOA) as { legal_entity_name?: string; logo_url?: string; primary_color?: string; document_footer?: string } | undefined;

    const tableRows = entries.map((e) => {
      const inc = e.included === 1;
      return `<tr>
        <td><strong>${e.control_id}</strong></td>
        <td>${e.control_name ?? "—"}</td>
        <td>${e.theme ?? "—"}</td>
        <td style="color:${inc ? "#065f46" : "#991b1b"};font-weight:600">${inc ? "✓ Yes" : "✗ No"}</td>
        <td>${e.justification}</td>
        <td>${e.status ?? "—"}</td>
        <td>${e.responsible_party ?? "—"}</td>
      </tr>`;
    }).join("\n");

    const bodyHtml = `
      <p><strong>ISMS Version:</strong> ISO 27001:${soa.isms_version} &nbsp;·&nbsp;
         <strong>Total:</strong> ${entries.length} &nbsp;·&nbsp;
         <strong>Included:</strong> ${includedCount} &nbsp;·&nbsp;
         <strong>Excluded:</strong> ${excludedCount}</p>
      <table>
        <thead>
          <tr><th>Control ID</th><th>Name</th><th>Theme</th><th>Included</th><th>Justification</th><th>Status</th><th>Responsible Party</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;

    const html = renderHtmlDocument(bodyHtml, {
      title:             "Statement of Applicability",
      organisation_name: profileRow?.legal_entity_name ?? "Organisation",
      logo_url:          profileRow?.logo_url,
      primary_color:     profileRow?.primary_color,
      document_footer:   profileRow?.document_footer,
      doc_type:          `ISO 27001:${soa.isms_version}`,
    });
    return ok({ format: "html", content: html });
  }

  if (format === "csv") {
    const header = "control_id,name,theme,included,justification,status,responsible_party";
    const rows   = entries.map((e) =>
      [
        e.control_id,
        `"${e.control_name ?? ""}"`,
        e.theme ?? "",
        e.included === 1 ? "Yes" : "No",
        `"${e.justification.replace(/"/g, '""')}"`,
        e.status ?? "",
        e.responsible_party ?? "",
      ].join(",")
    );
    return ok({ format: "csv", content: [header, ...rows].join("\n") });
  }

  // markdown
  const includeRows = entries.filter((e) => e.included === 1);
  const excludeRows = entries.filter((e) => e.included === 0);

  const lines: string[] = [
    `# Statement of Applicability`,
    ``,
    `**ISMS Version:** ISO 27001:${soa.isms_version}`,
    `**Assessment ID:** ${soa.assessment_id}`,
    `**Generated:** ${new Date().toISOString().split("T")[0]}`,
    `**Total Controls:** ${entries.length} | Included: ${includedCount} | Excluded: ${excludedCount}`,
    ``,
    `## Included Controls (${includedCount})`,
    ``,
    `| Control ID | Name | Theme | Status | Responsible Party | Justification |`,
    `|------------|------|-------|--------|-------------------|---------------|`,
    ...includeRows.map((e) =>
      `| ${e.control_id} | ${e.control_name ?? "—"} | ${e.theme ?? "—"} | ${e.status ?? "—"} | ${e.responsible_party ?? "—"} | ${e.justification} |`
    ),
    ``,
    `## Excluded Controls (${excludedCount})`,
    ``,
    `| Control ID | Name | Justification |`,
    `|------------|------|---------------|`,
    ...excludeRows.map((e) =>
      `| ${e.control_id} | ${e.control_name ?? "—"} | ${e.justification} |`
    ),
  ];

  return ok({ format: "markdown", content: lines.join("\n") });
}
