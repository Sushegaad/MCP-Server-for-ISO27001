/**
 * iso27001-mcp — Group 3: Risk Management handlers
 *
 * create_risk, get_risk, update_risk, list_risks, get_risk_summary,
 * create_treatment_plan, update_treatment_status, generate_risk_register
 */

import { getDb } from "../db/connection.js";
import { newId, now, toJson, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";

// ── Types ─────────────────────────────────────────────────────

interface RiskRow {
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
  related_controls: string | null;
  created_at: string;
  updated_at: string;
}

interface TreatmentRow {
  id: string;
  risk_id: string;
  treatment_type: string;
  description: string;
  owner: string;
  due_date: string;
  controls: string | null;
  status: string;
  residual_likelihood: number | null;
  residual_impact: number | null;
  residual_risk_score: number | null;
  residual_risk_level: string | null;
  evidence_ref: string | null;
  created_at: string;
  updated_at: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

function shapeRisk(r: RiskRow): Omit<RiskRow, "related_controls"> & { related_controls: string[] } {
  return {
    ...r,
    related_controls: fromJsonArray<string>(r.related_controls),
  };
}

function shapeTreatment(t: TreatmentRow): Omit<TreatmentRow, "controls"> & { controls: string[] } {
  return {
    ...t,
    controls: fromJsonArray<string>(t.controls),
  };
}

function requireRisk(id: string): RiskRow {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM risks WHERE id = ?").get(id) as RiskRow | undefined;
  if (!row) throw notFound("risk", id);
  return row;
}

// ── create_risk ───────────────────────────────────────────────

export function handleCreateRisk(args: Record<string, unknown>): ToolResult {
  const {
    asset, threat, vulnerability, likelihood, impact,
    owner, related_controls, status = "open",
  } = args as {
    asset: string; threat: string; vulnerability: string;
    likelihood: number; impact: number;
    owner?: string; related_controls?: string[]; status?: string;
  };

  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO risks
      (id, asset, threat, vulnerability, likelihood, impact,
       owner, status, related_controls, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, asset, threat, vulnerability, likelihood, impact,
    owner ?? null, status, toJson(related_controls), ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM risks WHERE id = ?").get(id) as RiskRow;
  return ok(shapeRisk(created));
}

// ── get_risk ──────────────────────────────────────────────────

export function handleGetRisk(args: Record<string, unknown>): ToolResult {
  const { risk_id, include_treatments = false } = args as {
    risk_id: string; include_treatments?: boolean;
  };

  const risk = requireRisk(risk_id);
  const result: Record<string, unknown> = shapeRisk(risk);

  if (include_treatments) {
    const treatments = getDb().prepare(
      "SELECT * FROM risk_treatments WHERE risk_id = ? ORDER BY created_at"
    ).all(risk_id) as TreatmentRow[];
    result["treatments"] = treatments.map(shapeTreatment);
  }

  return ok(result);
}

// ── update_risk ───────────────────────────────────────────────

export function handleUpdateRisk(args: Record<string, unknown>): ToolResult {
  const {
    risk_id, asset, threat, vulnerability, likelihood, impact,
    owner, status, related_controls,
  } = args as {
    risk_id: string; asset?: string; threat?: string;
    vulnerability?: string; likelihood?: number; impact?: number;
    owner?: string; status?: string; related_controls?: string[];
  };

  const existing = requireRisk(risk_id);
  const ts = now();

  getDb().prepare(`
    UPDATE risks SET
      asset            = COALESCE(?, asset),
      threat           = COALESCE(?, threat),
      vulnerability    = COALESCE(?, vulnerability),
      likelihood       = COALESCE(?, likelihood),
      impact           = COALESCE(?, impact),
      owner            = COALESCE(?, owner),
      status           = COALESCE(?, status),
      related_controls = COALESCE(?, related_controls),
      updated_at       = ?
    WHERE id = ?
  `).run(
    asset ?? null, threat ?? null, vulnerability ?? null,
    likelihood ?? null, impact ?? null, owner ?? null, status ?? null,
    related_controls !== undefined ? toJson(related_controls) : null,
    ts, risk_id,
  );

  void existing;
  const updated = getDb().prepare("SELECT * FROM risks WHERE id = ?").get(risk_id) as RiskRow;
  return ok(shapeRisk(updated));
}

// ── list_risks ────────────────────────────────────────────────

export function handleListRisks(args: Record<string, unknown>): ToolResult {
  const { risk_level, status, owner, limit = 50, offset = 0 } = args as {
    risk_level?: string; status?: string; owner?: string;
    limit?: number; offset?: number;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (risk_level) { conditions.push("risk_level = ?"); params.push(risk_level); }
  if (status)     { conditions.push("status = ?");     params.push(status); }
  if (owner)      { conditions.push("owner = ?");      params.push(owner); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db = getDb();

  const total = (db.prepare(`SELECT count(*) AS n FROM risks ${where}`).get(...params) as { n: number }).n;
  params.push(limit, offset);

  const rows = db.prepare(
    `SELECT * FROM risks ${where} ORDER BY risk_score DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...params) as RiskRow[];

  return ok({ total, limit, offset, risks: rows.map(shapeRisk) });
}

// ── get_risk_summary ──────────────────────────────────────────

export function handleGetRiskSummary(_args: Record<string, unknown>): ToolResult {
  const db = getDb();

  const byLevel = db.prepare(`
    SELECT risk_level, count(*) AS count FROM risks GROUP BY risk_level
  `).all() as { risk_level: string; count: number }[];

  const byStatus = db.prepare(`
    SELECT status, count(*) AS count FROM risks GROUP BY status
  `).all() as { status: string; count: number }[];

  const byTreatment = db.prepare(`
    SELECT treatment_type, count(*) AS count FROM risk_treatments GROUP BY treatment_type
  `).all() as { treatment_type: string; count: number }[];

  const total = (db.prepare("SELECT count(*) AS n FROM risks").get() as { n: number }).n;

  // Top-10 highest risks by risk_score
  const top10 = db.prepare(`
    SELECT id, asset, threat, risk_score, risk_level, status, owner
    FROM risks ORDER BY risk_score DESC LIMIT 10
  `).all() as { id: string; asset: string; threat: string; risk_score: number; risk_level: string; status: string; owner: string | null }[];

  // Open treatment count (planned + in_progress)
  const openTreatments = (db.prepare(`
    SELECT count(*) AS n FROM risk_treatments WHERE status IN ('planned','in_progress')
  `).get() as { n: number }).n;

  // 5×5 likelihood × impact heatmap matrix
  const heatmapRows = db.prepare(`
    SELECT likelihood, impact, count(*) AS count FROM risks GROUP BY likelihood, impact
  `).all() as { likelihood: number; impact: number; count: number }[];

  const heatmap: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0) as number[]);
  for (const r of heatmapRows) {
    heatmap[r.likelihood - 1][r.impact - 1] = r.count;
  }

  return ok({
    total_risks:       total,
    by_level:          byLevel,
    by_status:         byStatus,
    by_treatment:      byTreatment,
    open_treatments:   openTreatments,
    top_10_by_score:   top10,
    heatmap_5x5: {
      description: "Row = likelihood (1–5), Column = impact (1–5), value = risk count",
      matrix:      heatmap,
    },
  });
}

// ── create_treatment_plan ─────────────────────────────────────

export function handleCreateTreatmentPlan(args: Record<string, unknown>): ToolResult {
  const {
    risk_id, treatment_type, description, owner, due_date,
    controls, residual_likelihood, residual_impact, evidence_ref,
  } = args as {
    risk_id: string; treatment_type: string; description: string;
    owner: string; due_date: string; controls?: string[];
    residual_likelihood?: number; residual_impact?: number;
    evidence_ref?: string;
  };

  requireRisk(risk_id);

  // Business rule: 'mitigate' treatment type requires at least one control reference
  if (treatment_type === "mitigate" && (!controls || controls.length === 0)) {
    throw businessRule(
      "controls",
      "controls[] is required when treatment_type is 'mitigate'. Specify the ISO 27001 controls that will mitigate this risk.",
    );
  }

  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO risk_treatments
      (id, risk_id, treatment_type, description, owner, due_date,
       controls, status, residual_likelihood, residual_impact,
       evidence_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?)
  `).run(
    id, risk_id, treatment_type, description, owner, due_date,
    toJson(controls), residual_likelihood ?? null, residual_impact ?? null,
    evidence_ref ?? null, ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM risk_treatments WHERE id = ?").get(id) as TreatmentRow;
  return ok(shapeTreatment(created));
}

// ── update_treatment_status ───────────────────────────────────

export function handleUpdateTreatmentStatus(args: Record<string, unknown>): ToolResult {
  const {
    treatment_id, status, evidence_ref, residual_likelihood, residual_impact,
  } = args as {
    treatment_id: string; status: string;
    evidence_ref?: string; residual_likelihood?: number; residual_impact?: number;
  };

  const db  = getDb();
  const row = db.prepare("SELECT id FROM risk_treatments WHERE id = ?").get(treatment_id) as
    { id: string } | undefined;
  if (!row) throw notFound("risk_treatment", treatment_id);

  const ts = now();
  db.prepare(`
    UPDATE risk_treatments SET
      status               = ?,
      evidence_ref         = COALESCE(?, evidence_ref),
      residual_likelihood  = COALESCE(?, residual_likelihood),
      residual_impact      = COALESCE(?, residual_impact),
      updated_at           = ?
    WHERE id = ?
  `).run(
    status, evidence_ref ?? null, residual_likelihood ?? null,
    residual_impact ?? null, ts, treatment_id,
  );

  const updated = db.prepare("SELECT * FROM risk_treatments WHERE id = ?").get(treatment_id) as TreatmentRow;
  return ok(shapeTreatment(updated));
}

// ── generate_risk_register ────────────────────────────────────

export function handleGenerateRiskRegister(args: Record<string, unknown>): ToolResult {
  const { format, risk_level_filter, status_filter } = args as {
    format: string; risk_level_filter?: string; status_filter?: string;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (risk_level_filter) { conditions.push("r.risk_level = ?"); params.push(risk_level_filter); }
  if (status_filter)     { conditions.push("r.status = ?");     params.push(status_filter); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db    = getDb();

  const risks = db.prepare(
    `SELECT r.*, group_concat(rt.treatment_type) AS treatment_types
     FROM risks r
     LEFT JOIN risk_treatments rt ON rt.risk_id = r.id
     ${where}
     GROUP BY r.id
     ORDER BY r.risk_score DESC`
  ).all(...params) as Array<RiskRow & { treatment_types: string | null }>;

  if (format === "json") {
    return ok({ total: risks.length, risks: risks.map((r) => ({
      ...shapeRisk(r),
      treatment_types: r.treatment_types ? r.treatment_types.split(",") : [],
    })) });
  }

  if (format === "csv") {
    const header = "id,asset,threat,likelihood,impact,risk_score,risk_level,status,owner,treatment_types";
    const rows   = risks.map((r) =>
      [r.id, `"${r.asset}"`, `"${r.threat}"`, r.likelihood, r.impact,
       r.risk_score, r.risk_level, r.status,
       r.owner ?? "", r.treatment_types ?? ""].join(",")
    );
    return ok({ format: "csv", content: [header, ...rows].join("\n") });
  }

  // markdown
  const lines: string[] = [
    `# Risk Register`,
    ``,
    `**Generated:** ${new Date().toISOString().split("T")[0]}`,
    `**Total Risks:** ${risks.length}`,
    ``,
    `| ID | Asset | Threat | Score | Level | Status | Owner |`,
    `|----|-------|--------|-------|-------|--------|-------|`,
    ...risks.map((r) =>
      `| ${r.id.slice(0, 8)} | ${r.asset} | ${r.threat} | ${r.risk_score} | ${r.risk_level} | ${r.status} | ${r.owner ?? "—"} |`
    ),
  ];

  return ok({ format: "markdown", content: lines.join("\n") });
}
