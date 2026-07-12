/**
 * iso27001-mcp — Group 15: CSV Import handlers
 *
 * import_risks            — bulk-register risks from a CSV string
 * import_control_statuses — bulk-update control statuses in an assessment from CSV
 *
 * CSV content is passed as a plain string parameter. Supports dry_run mode
 * that validates rows and returns a preview without writing.
 */

import { getDb }    from "../db/connection.js";
import { newId, now, toJson } from "../db/dal.js";
import { ok, type ToolResult } from "../types/result.js";
import { businessRule } from "../types/errors.js";
import type { AssessmentRow } from "../db/types.js";

// ── CSV helpers ───────────────────────────────────────────────

function parseCSV(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map(line => line.split(",").map(cell => cell.trim().replace(/^"|"$/g, "").trim()))
    .filter(row => row.some(cell => cell.length > 0));
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function csvToObjects(raw: string): Record<string, string>[] {
  const rows = parseCSV(raw);
  if (rows.length < 2) throw businessRule("csv_content", "CSV must have at least a header row and one data row.");
  const headers = (rows[0] ?? []).map(normaliseHeader);
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
}

// ── import_risks ──────────────────────────────────────────────

const VALID_RISK_STATUSES = ["open", "accepted", "mitigated", "transferred", "closed"];

export function handleImportRisks(args: Record<string, unknown>): ToolResult {
  const {
    csv_content,
    default_status = "open",
    dry_run        = false,
  } = args as { csv_content: string; default_status?: string; dry_run?: boolean };

  const rows = csvToObjects(csv_content);

  const errors:   { row: number; error: string }[] = [];
  const previews: Record<string, unknown>[]         = [];

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i]!;
    const num = i + 2; // 1-indexed, row 1 is header

    const asset           = r["asset"]           ?? r["asset_name"]     ?? "";
    const threat          = r["threat"]           ?? r["threat_name"]    ?? "";
    const vulnerability   = r["vulnerability"]    ?? r["vuln"]           ?? "";
    const likelihoodRaw   = r["likelihood"]       ?? r["probability"]    ?? "";
    const impactRaw       = r["impact"]           ?? r["severity"]       ?? "";
    const owner           = r["owner"]            ?? r["risk_owner"]     ?? "";
    const statusRaw       = r["status"]           ?? r["risk_status"]    ?? "";
    const related         = r["related_controls"] ?? r["controls"]       ?? "";

    const rowErrors: string[] = [];

    if (!asset)         rowErrors.push("asset is required");
    if (!threat)        rowErrors.push("threat is required");
    if (!vulnerability) rowErrors.push("vulnerability is required");

    const likelihood = parseInt(likelihoodRaw, 10);
    if (!likelihoodRaw || isNaN(likelihood) || likelihood < 1 || likelihood > 5)
      rowErrors.push(`likelihood must be 1–5, got "${likelihoodRaw}"`);

    const impact = parseInt(impactRaw, 10);
    if (!impactRaw || isNaN(impact) || impact < 1 || impact > 5)
      rowErrors.push(`impact must be 1–5, got "${impactRaw}"`);

    const status = (statusRaw && VALID_RISK_STATUSES.includes(statusRaw)) ? statusRaw : default_status;

    if (rowErrors.length > 0) {
      errors.push({ row: num, error: rowErrors.join("; ") });
      continue;
    }

    const related_controls = related ? related.split(";").map(s => s.trim()).filter(Boolean) : [];
    const risk_score = likelihood * impact;
    const risk_level = risk_score >= 20 ? "Critical" : risk_score >= 12 ? "High" : risk_score >= 6 ? "Medium" : "Low";

    previews.push({ asset, threat, vulnerability, likelihood, impact, risk_score, risk_level, owner, status, related_controls });
  }

  if (errors.length > 0 && !dry_run) {
    return ok({
      success:        false,
      message:        `Import aborted: ${errors.length} row(s) failed validation. Fix errors and retry.`,
      errors,
      valid_rows:     previews.length,
    });
  }

  if (dry_run) {
    return ok({
      dry_run:    true,
      valid_rows: previews.length,
      error_rows: errors.length,
      errors,
      preview:    previews,
      message:    errors.length === 0
        ? `All ${previews.length} rows valid. Remove dry_run=true to import.`
        : `${errors.length} row(s) have errors. Fix them before importing.`,
    });
  }

  // Bulk insert
  const db = getDb();
  const ts = now();
  const insert = db.prepare(`
    INSERT INTO risks
      (id, asset, threat, vulnerability, likelihood, impact, risk_score, risk_level,
       owner, status, related_controls, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importMany = db.transaction((rows: typeof previews) => {
    const ids: string[] = [];
    for (const row of rows) {
      const id = newId();
      insert.run(
        id,
        row["asset"], row["threat"], row["vulnerability"],
        row["likelihood"], row["impact"], row["risk_score"], row["risk_level"],
        row["owner"] || null,
        row["status"],
        toJson(row["related_controls"] as string[]),
        ts, ts,
      );
      ids.push(id);
    }
    return ids;
  });

  const ids = importMany(previews);

  return ok({
    success:       true,
    imported:      ids.length,
    skipped_rows:  errors.length,
    errors,
    risk_ids:      ids,
    message:       `Imported ${ids.length} risk(s) successfully.${errors.length > 0 ? ` ${errors.length} row(s) skipped.` : ""}`,
  });
}

// ── import_control_statuses ───────────────────────────────────

const VALID_CONTROL_STATUSES = ["implemented", "partial", "not_implemented", "na", "not_started"];

export function handleImportControlStatuses(args: Record<string, unknown>): ToolResult {
  const {
    assessment_id,
    csv_content,
    dry_run = false,
  } = args as { assessment_id: string; csv_content: string; dry_run?: boolean };

  const db = getDb();

  const assessment = db.prepare("SELECT * FROM gap_assessments WHERE id = ?").get(assessment_id) as AssessmentRow | undefined;
  if (!assessment) throw businessRule("assessment_id", `Assessment '${assessment_id}' not found.`);
  if (assessment.archived_at) throw businessRule("assessment_id", "Cannot import into an archived assessment.");

  const rows = csvToObjects(csv_content);

  const errors:  { row: number; control_id: string; error: string }[] = [];
  const updates: { control_id: string; status: string; notes: string; na_justification: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i]!;
    const num = i + 2;

    const control_id       = r["control_id"]       ?? r["control"]  ?? "";
    const statusRaw        = r["status"]            ?? r["implementation_status"] ?? "";
    const notes            = r["notes"]             ?? r["note"]     ?? "";
    const na_justification = r["na_justification"]  ?? r["exclusion_justification"] ?? "";

    const rowErrors: string[] = [];

    if (!control_id)    rowErrors.push("control_id is required");
    if (!VALID_CONTROL_STATUSES.includes(statusRaw))
      rowErrors.push(`status must be one of ${VALID_CONTROL_STATUSES.join(", ")}, got "${statusRaw}"`);
    if (statusRaw === "na" && !na_justification)
      rowErrors.push("na_justification is required when status=na");

    if (rowErrors.length > 0) {
      errors.push({ row: num, control_id, error: rowErrors.join("; ") });
      continue;
    }

    // Check the control exists in this assessment
    const existing = db.prepare(
      "SELECT id FROM control_assessments WHERE assessment_id = ? AND control_id = ?"
    ).get(assessment_id, control_id);
    if (!existing) {
      errors.push({ row: num, control_id, error: `Control '${control_id}' is not in assessment '${assessment_id}'.` });
      continue;
    }

    updates.push({ control_id, status: statusRaw, notes, na_justification });
  }

  if (errors.length > 0 && !dry_run) {
    return ok({
      success:      false,
      message:      `Import aborted: ${errors.length} row(s) failed validation.`,
      errors,
      valid_rows:   updates.length,
    });
  }

  if (dry_run) {
    return ok({
      dry_run:    true,
      valid_rows: updates.length,
      error_rows: errors.length,
      errors,
      preview:    updates,
      message:    errors.length === 0
        ? `All ${updates.length} rows valid. Remove dry_run=true to import.`
        : `${errors.length} row(s) have errors.`,
    });
  }

  // Bulk update
  const ts = now();
  const updateStmt = db.prepare(`
    UPDATE control_assessments
    SET status = ?, notes = COALESCE(NULLIF(?, ''), notes), na_justification = COALESCE(NULLIF(?, ''), na_justification), updated_at = ?
    WHERE assessment_id = ? AND control_id = ?
  `);

  const applyMany = db.transaction((rows: typeof updates) => {
    for (const row of rows) {
      updateStmt.run(row.status, row.notes, row.na_justification, ts, assessment_id, row.control_id);
    }
  });

  applyMany(updates);

  return ok({
    success:      true,
    updated:      updates.length,
    skipped_rows: errors.length,
    errors,
    message:      `Updated ${updates.length} control status(es) in assessment '${assessment_id}'.${errors.length > 0 ? ` ${errors.length} row(s) skipped.` : ""}`,
  });
}
