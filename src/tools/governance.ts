/**
 * iso27001-mcp — Group 16: Risk Governance handlers
 *
 * set_risk_methodology   (admin, HITL)   — upsert the org-level singleton
 * record_risk_acceptance (analyst, HITL) — risk-owner accepts/rejects residual risk
 * list_risk_acceptances  (viewer)        — query recorded acceptance decisions
 *
 * ISO 27001:2022 §6.1.3 expects risk-owner approval of the treatment plan
 * and explicit acceptance of residual risk. These handlers make both
 * first-class, auditable records. update_treatment_status (risks.ts)
 * enforces that a plan cannot be verified/completed without an 'accepted'
 * risk_acceptance row for its risk.
 */

import { getDb } from "../db/connection.js";
import { newId, now, fromJsonArray } from "../db/dal.js";
import type { RiskRow, TreatmentRow } from "../db/types.js";
import { notFound, businessRule } from "../types/errors.js";
import { ok, type ToolResult } from "../types/result.js";
import { type DiffRow, buildPreviewResponse, consumeProposal } from "./hitl-utils.js";

// ── Constants ─────────────────────────────────────────────────

/**
 * Fixed ID for singleton semantics (same pattern as organization_profile).
 * INSERT OR REPLACE with this ID is the only write path.
 */
export const RISK_METHODOLOGY_ID = "default";

/**
 * Minimum rationale length when accepting a residual risk whose score
 * exceeds the methodology's acceptance threshold (escalation rule).
 */
const ABOVE_THRESHOLD_RATIONALE_MIN = 50;

// ── Types ─────────────────────────────────────────────────────

interface ScalePoint  { value: number; label: string }
interface RiskLevelBand { min: number; max: number; level: string }

interface MethodologyRow {
  id:                   string;
  likelihood_scale:     string;   // JSON array of ScalePoint
  impact_scale:         string;   // JSON array of ScalePoint
  calculation_method:   string;
  risk_level_bands:     string;   // JSON array of RiskLevelBand
  acceptance_threshold: number;
  escalation_rules:     string | null;
  review_frequency:     string;
  created_at:           string;
  updated_at:           string;
}

interface AcceptanceRow {
  id:                               string;
  risk_id:                          string;
  treatment_plan_id:                string | null;
  risk_owner:                       string;
  decision:                         string;
  inherent_score:                   number;
  residual_score:                   number | null;
  acceptance_threshold_at_decision: number | null;
  rationale:                        string;
  approved_at:                      string;
  review_due_at:                    string | null;
  created_at:                       string;
}

// ── Shared helpers ────────────────────────────────────────────

function loadMethodology(): MethodologyRow | undefined {
  return getDb()
    .prepare("SELECT * FROM risk_methodology WHERE id = ?")
    .get(RISK_METHODOLOGY_ID) as MethodologyRow | undefined;
}

function summariseScale(points: ScalePoint[]): string {
  return points.map((p) => `${p.value}=${p.label}`).join(", ");
}

function summariseBands(bands: RiskLevelBand[]): string {
  return bands.map((b) => `${b.min}–${b.max}: ${b.level}`).join(", ");
}

// ── set_risk_methodology ──────────────────────────────────────

export function handleSetRiskMethodology(args: Record<string, unknown>): ToolResult {
  const {
    likelihood_scale, impact_scale, calculation_method = "multiplication",
    risk_level_bands, acceptance_threshold = 6, escalation_rules,
    review_frequency = "annual", confirmed = false, proposal_id,
  } = args as {
    likelihood_scale: ScalePoint[]; impact_scale: ScalePoint[];
    calculation_method?: string; risk_level_bands: RiskLevelBand[];
    acceptance_threshold?: number; escalation_rules?: string;
    review_frequency?: string; confirmed?: boolean; proposal_id?: string;
  };

  const existing = loadMethodology();

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [
      {
        field: "likelihood_scale",
        old:   existing ? summariseScale(fromJsonArray<ScalePoint>(existing.likelihood_scale)) : null,
        new:   summariseScale(likelihood_scale),
      },
      {
        field: "impact_scale",
        old:   existing ? summariseScale(fromJsonArray<ScalePoint>(existing.impact_scale)) : null,
        new:   summariseScale(impact_scale),
      },
      {
        field: "calculation_method",
        old:   existing?.calculation_method ?? null,
        new:   calculation_method,
      },
      {
        field: "risk_level_bands",
        old:   existing ? summariseBands(fromJsonArray<RiskLevelBand>(existing.risk_level_bands)) : null,
        new:   summariseBands(risk_level_bands),
      },
      {
        field: "acceptance_threshold",
        old:   existing?.acceptance_threshold ?? null,
        new:   acceptance_threshold,
      },
      {
        field: "escalation_rules",
        old:   existing?.escalation_rules ?? null,
        new:   escalation_rules ?? null,
      },
      {
        field: "review_frequency",
        old:   existing?.review_frequency ?? null,
        new:   review_frequency,
      },
    ];
    return ok(buildPreviewResponse(
      "set_risk_methodology",
      rows,
      {
        message: existing
          ? "⏸ No data written. Pass \"confirmed\": true to update the risk methodology."
          : "⏸ No data written. This will create the organisation's risk methodology. Pass \"confirmed\": true to apply.",
      },
      existing
        ? { resource_id: RISK_METHODOLOGY_ID, resource_version: String(existing.updated_at) }
        : undefined,
    ));
  }

  consumeProposal(
    proposal_id,
    "set_risk_methodology",
    existing ? { resource_version: String(existing.updated_at) } : undefined,
  );

  const ts = now();
  getDb().prepare(`
    INSERT OR REPLACE INTO risk_methodology
      (id, likelihood_scale, impact_scale, calculation_method,
       risk_level_bands, acceptance_threshold, escalation_rules,
       review_frequency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
      (SELECT created_at FROM risk_methodology WHERE id = ?), ?
    ), ?)
  `).run(
    RISK_METHODOLOGY_ID,
    JSON.stringify(likelihood_scale),
    JSON.stringify(impact_scale),
    calculation_method,
    JSON.stringify(risk_level_bands),
    acceptance_threshold,
    escalation_rules ?? null,
    review_frequency,
    RISK_METHODOLOGY_ID,
    ts,
    ts,
  );

  return ok({
    id:                   RISK_METHODOLOGY_ID,
    likelihood_scale,
    impact_scale,
    calculation_method,
    risk_level_bands,
    acceptance_threshold,
    escalation_rules:     escalation_rules ?? null,
    review_frequency,
    updated_at:           ts,
  });
}

// ── record_risk_acceptance ────────────────────────────────────

export function handleRecordRiskAcceptance(args: Record<string, unknown>): ToolResult {
  const {
    risk_id, treatment_plan_id, risk_owner, decision,
    rationale, review_due_at, confirmed = false, proposal_id,
  } = args as {
    risk_id: string; treatment_plan_id?: string; risk_owner: string;
    decision: string; rationale: string; review_due_at?: string;
    confirmed?: boolean; proposal_id?: string;
  };

  const db = getDb();

  const risk = db.prepare("SELECT * FROM risks WHERE id = ?").get(risk_id) as RiskRow | undefined;
  if (!risk) throw notFound("risk", risk_id);

  let residualScore: number | null = null;
  if (treatment_plan_id !== undefined) {
    const plan = db.prepare("SELECT * FROM risk_treatments WHERE id = ?")
      .get(treatment_plan_id) as TreatmentRow | undefined;
    if (!plan) throw notFound("risk_treatment", treatment_plan_id);
    if (plan.risk_id !== risk_id) {
      throw businessRule(
        "treatment_plan_id",
        `Treatment plan ${treatment_plan_id} belongs to risk ${plan.risk_id}, not ${risk_id}.`,
      );
    }
    if (plan.residual_likelihood == null || plan.residual_impact == null) {
      throw businessRule(
        "treatment_plan_id",
        "Record residual likelihood/impact on the treatment plan before the risk owner can accept residual risk (update_treatment_status with residual_likelihood and residual_impact).",
      );
    }
    residualScore = plan.residual_likelihood * plan.residual_impact;
  }

  const inherentScore = risk.likelihood * risk.impact;

  const methodology = db.prepare(
    "SELECT acceptance_threshold FROM risk_methodology WHERE id = ?"
  ).get(RISK_METHODOLOGY_ID) as { acceptance_threshold: number } | undefined;
  const threshold = methodology?.acceptance_threshold ?? null;

  // Escalation rule: accepting an above-threshold residual risk demands a
  // substantive rationale — a one-liner is not a governance decision.
  if (
    decision === "accepted" && residualScore !== null && threshold !== null &&
    residualScore > threshold && rationale.length < ABOVE_THRESHOLD_RATIONALE_MIN
  ) {
    throw businessRule(
      "rationale",
      `Residual score ${residualScore} exceeds the acceptance threshold ${threshold}. ` +
      `Accepting an above-threshold residual risk requires a substantive rationale ` +
      `(at least ${ABOVE_THRESHOLD_RATIONALE_MIN} characters).`,
    );
  }

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    const rows: DiffRow[] = [
      { field: "decision",                         old: null, new: decision },
      { field: "risk_owner",                       old: null, new: risk_owner },
      { field: "inherent_score",                   old: null, new: inherentScore },
      { field: "residual_score",                   old: null, new: residualScore },
      { field: "acceptance_threshold_at_decision", old: null, new: threshold },
      { field: "review_due_at",                    old: null, new: review_due_at ?? null },
    ];
    return ok(buildPreviewResponse("record_risk_acceptance", rows, {
      risk_id,
      treatment_plan_id: treatment_plan_id ?? null,
      message: `⏸ No data written. Pass "confirmed": true to record this ${decision === "accepted" ? "acceptance" : "rejection"} of residual risk.`,
    }));
  }

  consumeProposal(proposal_id, "record_risk_acceptance");

  const id = newId();
  const ts = now();

  db.prepare(`
    INSERT INTO risk_acceptances
      (id, risk_id, treatment_plan_id, risk_owner, decision,
       inherent_score, residual_score, acceptance_threshold_at_decision,
       rationale, approved_at, review_due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, risk_id, treatment_plan_id ?? null, risk_owner, decision,
    inherentScore, residualScore, threshold,
    rationale, ts, review_due_at ?? null, ts,
  );

  const created = db.prepare("SELECT * FROM risk_acceptances WHERE id = ?").get(id) as AcceptanceRow;
  return ok(created);
}

// ── list_risk_acceptances ─────────────────────────────────────

export function handleListRiskAcceptances(args: Record<string, unknown>): ToolResult {
  const { risk_id, decision, limit = 50, offset = 0 } = args as {
    risk_id?: string; decision?: string; limit?: number; offset?: number;
  };

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (risk_id)  { conditions.push("risk_id = ?");  params.push(risk_id); }
  if (decision) { conditions.push("decision = ?"); params.push(decision); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const db = getDb();

  const total = (db.prepare(`SELECT count(*) AS n FROM risk_acceptances ${where}`)
    .get(...params) as { n: number }).n;
  params.push(limit, offset);

  const rows = db.prepare(
    `SELECT * FROM risk_acceptances ${where} ORDER BY approved_at DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...params) as AcceptanceRow[];

  return ok({ total, limit, offset, acceptances: rows });
}
