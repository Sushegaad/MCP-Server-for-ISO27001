/**
 * iso27001-mcp — Group 2: Gap Analysis handlers
 *
 * create_gap_assessment, update_control_status, get_gap_summary,
 * list_gap_assessments, export_gap_report, generate_remediation_roadmap,
 * archive_gap_assessment
 */

import { getDb } from "../db/connection.js";
import { newId, now, toJson, fromJsonArray, withTransaction } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";

// ── Types ─────────────────────────────────────────────────────

interface AssessmentRow {
  id: string;
  name: string;
  scope: string | null;
  isms_version: string;
  status: string;
  themes_in_scope: string | null;
  exclude_controls: string | null;
  exclude_justification: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ControlRow {
  control_id: string;
  name: string;
  theme: string;
  control_type: string;
  new_in_2022: number;
  description: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

function requireAssessment(id: string): AssessmentRow {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM gap_assessments WHERE id = ?").get(id) as AssessmentRow | undefined;
  if (!row) throw notFound("gap_assessment", id);
  return row;
}

// ── create_gap_assessment ─────────────────────────────────────

export function handleCreateGapAssessment(args: Record<string, unknown>): ToolResult {
  const {
    name, scope, isms_version = "2022",
    themes_in_scope, exclude_controls, exclude_justification,
  } = args as {
    name: string; scope?: string; isms_version?: string;
    themes_in_scope?: string[]; exclude_controls?: string[];
    exclude_justification?: string;
  };

  const id = newId();
  const ts = now();
  const db = getDb();

  const excludedIds   = exclude_controls ?? [];
  const themesInScope = themes_in_scope  ?? [];

  // Determine in-scope controls upfront
  let controlQuery = "SELECT control_id FROM controls WHERE version = ?";
  const controlParams: unknown[] = [isms_version ?? "2022"];
  if (themesInScope.length > 0) {
    controlQuery += ` AND theme IN (${themesInScope.map(() => "?").join(",")})`;
    controlParams.push(...themesInScope);
  }
  const inScopeControls = db.prepare(controlQuery).all(...controlParams) as { control_id: string }[];

  // Insert assessment + pre-populate every control_statuses row in one transaction
  withTransaction(() => {
    db.prepare(`
      INSERT INTO gap_assessments
        (id, name, scope, isms_version, status, themes_in_scope,
         exclude_controls, exclude_justification, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      id, name, scope ?? null, isms_version ?? "2022",
      toJson(themes_in_scope), toJson(exclude_controls),
      exclude_justification ?? null, ts, ts,
    );

    const insertStatus = db.prepare(`
      INSERT INTO control_statuses
        (id, assessment_id, control_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'not_started', ?, ?)
    `);

    for (const ctrl of inScopeControls) {
      if (!excludedIds.includes(ctrl.control_id)) {
        insertStatus.run(newId(), id, ctrl.control_id, ts, ts);
      } else {
        // Excluded controls get na status with justification pre-filled
        db.prepare(`
          INSERT INTO control_statuses
            (id, assessment_id, control_id, status, na_justification, created_at, updated_at)
          VALUES (?, ?, ?, 'na', ?, ?, ?)
        `).run(newId(), id, ctrl.control_id, exclude_justification ?? "Excluded from assessment scope.", ts, ts);
      }
    }
  });

  return ok({
    id, name, isms_version: isms_version ?? "2022", status: "active",
    controls_in_scope: inScopeControls.length - excludedIds.filter(
      (e) => inScopeControls.some((c) => c.control_id === e)
    ).length,
    controls_excluded: excludedIds.length,
    created_at: ts,
  });
}

// ── update_control_status ─────────────────────────────────────

export function handleUpdateControlStatus(args: Record<string, unknown>): ToolResult {
  const {
    assessment_id, control_id, status,
    evidence_refs, notes, na_justification, assessed_by,
  } = args as {
    assessment_id: string; control_id: string; status: string;
    evidence_refs?: string[]; notes?: string;
    na_justification?: string; assessed_by?: string;
  };

  const assessment = requireAssessment(assessment_id);

  // Business rule: cannot update statuses on an archived assessment
  if (assessment.status === "archived") {
    throw businessRule("assessment_id", "Cannot update control statuses on an archived assessment.");
  }

  // Business rule: na_justification is required when status is 'na'
  if (status === "na" && !na_justification) {
    throw businessRule("na_justification", "na_justification is required when setting status to 'na'.");
  }

  // Business rule: silent downgrade — 'implemented' without evidence_refs becomes 'partial'
  let effectiveStatus = status;
  let downgradeWarning: string | null = null;
  if (status === "implemented" && (!evidence_refs || evidence_refs.length === 0)) {
    effectiveStatus   = "partial";
    downgradeWarning  = "Status downgraded from 'implemented' to 'partial': no evidence_refs provided. Add evidence references to mark as implemented.";
  }

  const db  = getDb();
  const ts  = now();
  const existing = db.prepare(
    "SELECT id FROM control_statuses WHERE assessment_id = ? AND control_id = ?"
  ).get(assessment_id, control_id) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE control_statuses
      SET status=?, evidence_refs=?, notes=?, assessed_by=?,
          na_justification=?, assessed_at=datetime('now'), updated_at=?
      WHERE id=?
    `).run(
      effectiveStatus, toJson(evidence_refs), notes ?? null,
      assessed_by ?? null, na_justification ?? null, ts, existing.id,
    );
    return ok({
      id: existing.id, assessment_id, control_id,
      status: effectiveStatus,
      ...(downgradeWarning ? { warning: downgradeWarning } : {}),
      updated_at: ts,
    });
  } else {
    const id = newId();
    db.prepare(`
      INSERT INTO control_statuses
        (id, assessment_id, control_id, status, evidence_refs,
         notes, assessed_by, na_justification, assessed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(
      id, assessment_id, control_id, effectiveStatus,
      toJson(evidence_refs), notes ?? null,
      assessed_by ?? null, na_justification ?? null, ts, ts,
    );
    return ok({
      id, assessment_id, control_id,
      status: effectiveStatus,
      ...(downgradeWarning ? { warning: downgradeWarning } : {}),
      created_at: ts,
    });
  }
}

// ── get_gap_summary ───────────────────────────────────────────

export function handleGetGapSummary(args: Record<string, unknown>): ToolResult {
  const { assessment_id, breakdown_by } = args as {
    assessment_id: string;
    breakdown_by?: "theme" | "control_type" | "cybersecurity_concept";
  };

  const assessment = requireAssessment(assessment_id);
  const db = getDb();
  const version = assessment.isms_version;

  // All controls for this version (respecting themes/exclude filters)
  const excludedIds = fromJsonArray<string>(assessment.exclude_controls);
  const themesInScope = fromJsonArray<string>(assessment.themes_in_scope);

  let controlQuery = "SELECT control_id, name, theme, control_type, new_in_2022, description, attributes FROM controls WHERE version = ?";
  const controlParams: unknown[] = [version];
  if (themesInScope.length > 0) {
    controlQuery += ` AND theme IN (${themesInScope.map(() => "?").join(",")})`;
    controlParams.push(...themesInScope);
  }
  const allControls = db.prepare(controlQuery).all(...controlParams) as (ControlRow & { attributes: string | null })[];
  const inScopeControls = excludedIds.length > 0
    ? allControls.filter((c) => !excludedIds.includes(c.control_id))
    : allControls;

  // Statuses recorded so far
  const statuses = db.prepare(
    "SELECT control_id, status FROM control_statuses WHERE assessment_id = ?"
  ).all(assessment_id) as { control_id: string; status: string }[];
  const statusMap = new Map(statuses.map((s) => [s.control_id, s.status]));

  const totalControls     = inScopeControls.length;
  const implemented       = inScopeControls.filter((c) => statusMap.get(c.control_id) === "implemented").length;
  const partial           = inScopeControls.filter((c) => statusMap.get(c.control_id) === "partial").length;
  const notImplemented    = inScopeControls.filter((c) => statusMap.get(c.control_id) === "not_implemented").length;
  const na                = inScopeControls.filter((c) => statusMap.get(c.control_id) === "na").length;
  const notStarted        = inScopeControls.filter((c) => !statusMap.has(c.control_id) || statusMap.get(c.control_id) === "not_started").length;
  const compliancePercent = totalControls > 0
    ? Math.round(((implemented + na) / totalControls) * 100)
    : 0;

  const summary: Record<string, unknown> = {
    assessment_id,
    assessment_name:    assessment.name,
    isms_version:       version,
    total_controls:     totalControls,
    implemented,
    partial,
    not_implemented:    notImplemented,
    not_applicable:     na,
    not_started:        notStarted,
    compliance_percent: compliancePercent,
  };

  // Optional breakdown
  if (breakdown_by === "theme") {
    const themes = [...new Set(inScopeControls.map((c) => c.theme))];
    summary["breakdown"] = themes.map((theme) => {
      const group = inScopeControls.filter((c) => c.theme === theme);
      return {
        group:       theme,
        total:       group.length,
        implemented: group.filter((c) => statusMap.get(c.control_id) === "implemented").length,
        partial:     group.filter((c) => statusMap.get(c.control_id) === "partial").length,
        not_implemented: group.filter((c) => statusMap.get(c.control_id) === "not_implemented").length,
      };
    });
  } else if (breakdown_by === "control_type") {
    const typeSet = new Set<string>();
    inScopeControls.forEach((c) => {
      try { (JSON.parse(c.control_type) as string[]).forEach((t) => typeSet.add(t)); } catch { /* ignore */ }
    });
    summary["breakdown"] = [...typeSet].map((ctype) => {
      const group = inScopeControls.filter((c) => {
        try { return (JSON.parse(c.control_type) as string[]).includes(ctype); } catch { return false; }
      });
      return {
        group:           ctype,
        total:           group.length,
        implemented:     group.filter((c) => statusMap.get(c.control_id) === "implemented").length,
        not_implemented: group.filter((c) => statusMap.get(c.control_id) === "not_implemented").length,
      };
    });
  } else if (breakdown_by === "cybersecurity_concept") {
    const conceptSet = new Set<string>();
    inScopeControls.forEach((c) => {
      if ((c as ControlRow & { attributes: string | null }).attributes) {
        try {
          const attrs = JSON.parse((c as ControlRow & { attributes: string | null }).attributes!) as
            { cybersecurity_concepts?: string[] };
          (attrs.cybersecurity_concepts ?? []).forEach((cc) => conceptSet.add(cc));
        } catch { /* ignore */ }
      }
    });
    summary["breakdown"] = [...conceptSet].map((concept) => {
      const group = inScopeControls.filter((c) => {
        try {
          const attrs = JSON.parse((c as ControlRow & { attributes: string | null }).attributes ?? "{}") as
            { cybersecurity_concepts?: string[] };
          return (attrs.cybersecurity_concepts ?? []).includes(concept);
        } catch { return false; }
      });
      return {
        group:           concept,
        total:           group.length,
        implemented:     group.filter((c) => statusMap.get(c.control_id) === "implemented").length,
        not_implemented: group.filter((c) => statusMap.get(c.control_id) === "not_implemented").length,
      };
    });
  }

  // Top-10 remediation priority: not_implemented/partial controls cross-referenced with
  // open risks that reference each control — sorted by max risk_score descending
  const openRiskControls = db.prepare(`
    SELECT related_controls, risk_score FROM risks
    WHERE status IN ('open','accepted') AND related_controls IS NOT NULL
  `).all() as { related_controls: string; risk_score: number }[];

  const riskScoreByControl = new Map<string, number>();
  for (const r of openRiskControls) {
    try {
      const cids = JSON.parse(r.related_controls) as string[];
      for (const cid of cids) {
        const existing = riskScoreByControl.get(cid) ?? 0;
        if (r.risk_score > existing) riskScoreByControl.set(cid, r.risk_score);
      }
    } catch { /* ignore */ }
  }

  const gapControls = inScopeControls
    .filter((c) => ["not_implemented", "partial", "not_started"].includes(statusMap.get(c.control_id) ?? "not_started"))
    .map((c) => ({
      control_id:  c.control_id,
      name:        c.name,
      theme:       c.theme,
      status:      statusMap.get(c.control_id) ?? "not_started",
      max_risk_score: riskScoreByControl.get(c.control_id) ?? 0,
    }))
    .sort((a, b) => b.max_risk_score - a.max_risk_score || a.control_id.localeCompare(b.control_id))
    .slice(0, 10);

  summary["top_10_remediation_priority"] = gapControls;

  return ok(summary);
}

// ── list_gap_assessments ──────────────────────────────────────

export function handleListGapAssessments(args: Record<string, unknown>): ToolResult {
  const { filter = "active" } = args as { filter?: string };
  const db = getDb();

  let sql = "SELECT * FROM gap_assessments";
  if (filter === "active")   sql += " WHERE status = 'active'";
  if (filter === "archived") sql += " WHERE status = 'archived'";
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all() as AssessmentRow[];
  return ok({ count: rows.length, assessments: rows });
}

// ── export_gap_report ─────────────────────────────────────────

export function handleExportGapReport(args: Record<string, unknown>): ToolResult {
  const { assessment_id, format } = args as { assessment_id: string; format: string };

  const assessment = requireAssessment(assessment_id);
  const db = getDb();

  const statuses = db.prepare(`
    SELECT cs.control_id, cs.status, cs.notes, cs.assessed_by, cs.assessed_at,
           c.name, c.theme, c.description
    FROM control_statuses cs
    LEFT JOIN controls c ON c.control_id = cs.control_id AND c.version = ?
    WHERE cs.assessment_id = ?
    ORDER BY cs.control_id
  `).all(assessment.isms_version, assessment_id) as Array<{
    control_id: string; status: string; notes: string | null;
    assessed_by: string | null; assessed_at: string | null;
    name: string | null; theme: string | null; description: string | null;
  }>;

  if (format === "json") {
    return ok({ assessment, statuses });
  }

  if (format === "csv") {
    const header  = "control_id,name,theme,status,assessed_by,assessed_at,notes";
    const rows    = statuses.map((s) =>
      [s.control_id, `"${s.name ?? ""}"`, s.theme ?? "", s.status,
       s.assessed_by ?? "", s.assessed_at ?? "", `"${(s.notes ?? "").replace(/"/g, '""')}"`].join(",")
    );
    return ok({ format: "csv", content: [header, ...rows].join("\n") });
  }

  // markdown (default)
  const lines: string[] = [
    `# Gap Assessment Report: ${assessment.name}`,
    ``,
    `**ISMS Version:** ISO 27001:${assessment.isms_version}`,
    `**Status:** ${assessment.status}`,
    `**Scope:** ${assessment.scope ?? "Not defined"}`,
    `**Created:** ${assessment.created_at}`,
    ``,
    `## Control Status`,
    ``,
    `| Control ID | Name | Theme | Status | Assessed By |`,
    `|------------|------|-------|--------|-------------|`,
    ...statuses.map((s) =>
      `| ${s.control_id} | ${s.name ?? "—"} | ${s.theme ?? "—"} | ${s.status} | ${s.assessed_by ?? "—"} |`
    ),
  ];

  return ok({ format: "markdown", content: lines.join("\n") });
}

// ── generate_remediation_roadmap ──────────────────────────────

export function handleGenerateRemediationRoadmap(args: Record<string, unknown>): ToolResult {
  const { assessment_id, timeline_weeks = 12 } = args as {
    assessment_id: string; timeline_weeks?: number;
  };

  const assessment = requireAssessment(assessment_id);
  const db = getDb();

  // Get all not-implemented and partial controls with their details
  const gaps = db.prepare(`
    SELECT cs.control_id, cs.status, cs.notes,
           c.name, c.theme, c.description, c.control_type
    FROM control_statuses cs
    LEFT JOIN controls c ON c.control_id = cs.control_id AND c.version = ?
    WHERE cs.assessment_id = ? AND cs.status IN ('not_implemented','partial','not_started')
  `).all(assessment.isms_version, assessment_id) as Array<{
    control_id: string; status: string; notes: string | null;
    name: string | null; theme: string | null;
    description: string | null; control_type: string | null;
  }>;

  // Build a risk-score map: max open risk_score that references each control
  const openRisks = db.prepare(`
    SELECT related_controls, risk_score FROM risks
    WHERE status IN ('open','accepted') AND related_controls IS NOT NULL
  `).all() as { related_controls: string; risk_score: number }[];

  const riskScoreMap = new Map<string, number>();
  for (const r of openRisks) {
    try {
      (JSON.parse(r.related_controls) as string[]).forEach((cid) => {
        if ((riskScoreMap.get(cid) ?? 0) < r.risk_score) riskScoreMap.set(cid, r.risk_score);
      });
    } catch { /* ignore */ }
  }

  // Effort estimate by control_type (Preventive > Detective > Corrective)
  const effortByType: Record<string, string> = {
    Preventive: "High",
    Detective:  "Medium",
    Corrective: "Low",
  };

  // Theme priority: Technological first (highest attack surface), then Organizational, People, Physical
  const themeOrder: Record<string, number> = {
    Technological: 0, Organizational: 1, People: 2, Physical: 3,
  };

  // Sort: theme priority first, then risk_score descending within theme
  gaps.sort((a, b) => {
    const tA = themeOrder[a.theme ?? ""] ?? 4;
    const tB = themeOrder[b.theme ?? ""] ?? 4;
    if (tA !== tB) return tA - tB;
    return (riskScoreMap.get(b.control_id) ?? 0) - (riskScoreMap.get(a.control_id) ?? 0);
  });

  const totalGaps = gaps.length;
  const weeksPerPhase = Math.max(1, Math.floor(timeline_weeks / 3));
  const startDate = new Date();

  const chunkSize = Math.ceil(totalGaps / 3);

  const makeItems = (slice: typeof gaps, phaseStartWeek: number): Array<{
    control_id: string; name: string | null; theme: string | null; current_status: string;
    linked_risk_score: number; estimated_effort: string; recommended_due_date: string;
  }> =>
    slice.map((g): {
      control_id: string; name: string | null; theme: string | null; current_status: string;
      linked_risk_score: number; estimated_effort: string; recommended_due_date: string;
    } => {
      const ctypes = ((): string[] => { try { return JSON.parse(g.control_type ?? "[]") as string[]; } catch { return []; } })();
      const effort = ctypes.length > 0 ? (effortByType[ctypes[0]] ?? "Medium") : "Medium";
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (phaseStartWeek + weeksPerPhase) * 7);
      return {
        control_id:            g.control_id,
        name:                  g.name,
        theme:                 g.theme,
        current_status:        g.status,
        linked_risk_score:     riskScoreMap.get(g.control_id) ?? 0,
        estimated_effort:      effort,
        recommended_due_date:  dueDate.toISOString().split("T")[0],
      };
    });

  const phases = [
    { phase: 1, label: "Foundation (Technological)",   weeks: `1–${weeksPerPhase}`,            items: makeItems(gaps.slice(0, chunkSize), 0) },
    { phase: 2, label: "Build-out (Organizational)",   weeks: `${weeksPerPhase + 1}–${weeksPerPhase * 2}`, items: makeItems(gaps.slice(chunkSize, chunkSize * 2), weeksPerPhase) },
    { phase: 3, label: "Hardening (People & Physical)", weeks: `${weeksPerPhase * 2 + 1}–${timeline_weeks}`, items: makeItems(gaps.slice(chunkSize * 2), weeksPerPhase * 2) },
  ];

  return ok({
    assessment_id,
    assessment_name: assessment.name,
    total_gaps:      totalGaps,
    timeline_weeks,
    phases: phases.map((p) => ({
      ...p,
      items: p.items,
    })),
  });
}

// ── archive_gap_assessment ────────────────────────────────────

export function handleArchiveGapAssessment(args: Record<string, unknown>): ToolResult {
  const { assessment_id, reason } = args as { assessment_id: string; reason?: string };

  const assessment = requireAssessment(assessment_id);
  if (assessment.status === "archived") {
    throw businessRule("gap_assessment", "Assessment is already archived.");
  }

  const ts = now();
  getDb().prepare(`
    UPDATE gap_assessments
    SET status='archived', archived_at=?, archive_reason=?, updated_at=?
    WHERE id=?
  `).run(ts, reason ?? null, ts, assessment_id);

  return ok({ id: assessment_id, status: "archived", archived_at: ts });
}

// keep withTransaction in scope (used by create handler tests)
void withTransaction;
