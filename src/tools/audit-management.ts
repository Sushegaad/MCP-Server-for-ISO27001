/**
 * iso27001-mcp — Group 4: Audit Management handlers
 *
 * create_audit, record_finding, create_corrective_action,
 * update_corrective_action, generate_audit_report
 */

import { getDb } from "../db/connection.js";
import { newId, now, toJson, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";

// ── Types ─────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  name: string;
  scope: string;
  auditor: string;
  planned_date: string;
  actual_date: string | null;
  status: string;
  controls_in_scope: string | null;
  clauses_in_scope: string | null;
  created_at: string;
  updated_at: string;
}

interface FindingRow {
  id: string;
  audit_id: string;
  type: string;
  clause_or_control: string;
  description: string;
  objective_evidence: string;
  severity: string | null;
  created_at: string;
  updated_at: string;
}

interface CarRow {
  id: string;
  finding_id: string;
  description: string;
  owner: string;
  due_date: string;
  status: string;
  root_cause: string | null;
  effectiveness_verified: number;
  evidence_ref: string | null;
  created_at: string;
  updated_at: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

function shapeAudit(r: AuditRow) {
  return {
    ...r,
    controls_in_scope: fromJsonArray<string>(r.controls_in_scope),
    clauses_in_scope: fromJsonArray<string>(r.clauses_in_scope),
  };
}

function shapeCar(r: CarRow) {
  return {
    ...r,
    effectiveness_verified: r.effectiveness_verified === 1,
  };
}

function requireAudit(id: string): AuditRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM audits WHERE id = ?").get(id) as AuditRow | undefined;
  if (!row) throw notFound("audit", id);
  return row;
}

function requireFinding(id: string): FindingRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as FindingRow | undefined;
  if (!row) throw notFound("finding", id);
  return row;
}

// ── create_audit ──────────────────────────────────────────────

export function handleCreateAudit(args: Record<string, unknown>): ToolResult {
  const {
    name, scope, auditor, planned_date,
    controls_in_scope, clauses_in_scope,
  } = args as {
    name: string; scope: string; auditor: string; planned_date: string;
    controls_in_scope?: string[]; clauses_in_scope?: string[];
  };

  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO audits
      (id, name, scope, auditor, planned_date, status,
       controls_in_scope, clauses_in_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?)
  `).run(
    id, name, scope, auditor, planned_date,
    toJson(controls_in_scope), toJson(clauses_in_scope),
    ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM audits WHERE id = ?").get(id) as AuditRow;
  return ok(shapeAudit(created));
}

// ── record_finding ────────────────────────────────────────────

export function handleRecordFinding(args: Record<string, unknown>): ToolResult {
  const {
    audit_id, type, clause_or_control, description,
    objective_evidence, severity,
  } = args as {
    audit_id: string; type: string; clause_or_control: string;
    description: string; objective_evidence: string; severity?: string;
  };

  requireAudit(audit_id);

  if (type === "nc" && !severity) {
    throw businessRule(
      "severity",
      "severity is required for NC findings (major or minor).",
    );
  }

  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO findings
      (id, audit_id, type, clause_or_control, description,
       objective_evidence, severity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, audit_id, type, clause_or_control, description,
    objective_evidence, severity ?? null, ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM findings WHERE id = ?").get(id) as FindingRow;
  return ok(created);
}

// ── create_corrective_action ──────────────────────────────────

export function handleCreateCorrectiveAction(args: Record<string, unknown>): ToolResult {
  const {
    finding_id, description, owner, due_date, root_cause,
  } = args as {
    finding_id: string; description: string; owner: string;
    due_date: string; root_cause?: string;
  };

  requireFinding(finding_id);

  const id = newId();
  const ts = now();

  getDb().prepare(`
    INSERT INTO corrective_actions
      (id, finding_id, description, owner, due_date, status,
       root_cause, effectiveness_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, 0, ?, ?)
  `).run(
    id, finding_id, description, owner, due_date,
    root_cause ?? null, ts, ts,
  );

  const created = getDb().prepare("SELECT * FROM corrective_actions WHERE id = ?").get(id) as CarRow;
  return ok(shapeCar(created));
}

// ── update_corrective_action ──────────────────────────────────

export function handleUpdateCorrectiveAction(args: Record<string, unknown>): ToolResult {
  const {
    car_id, description, owner, due_date, status,
    root_cause, effectiveness_verified, evidence_ref,
  } = args as {
    car_id: string; description?: string; owner?: string; due_date?: string;
    status?: string; root_cause?: string; effectiveness_verified?: boolean;
    evidence_ref?: string;
  };

  const db = getDb();
  const existing = db.prepare("SELECT * FROM corrective_actions WHERE id = ?").get(car_id) as CarRow | undefined;
  if (!existing) throw notFound("corrective_action", car_id);

  if (status === "closed" && effectiveness_verified !== true) {
    throw businessRule(
      "effectiveness_verified",
      "effectiveness_verified must be true before closing a corrective action (ISO 27001:2022 Clause 10.1).",
    );
  }

  const ts = now();
  const evInt = effectiveness_verified === undefined ? null : (effectiveness_verified ? 1 : 0);

  db.prepare(`
    UPDATE corrective_actions SET
      description             = COALESCE(?, description),
      owner                   = COALESCE(?, owner),
      due_date                = COALESCE(?, due_date),
      status                  = COALESCE(?, status),
      root_cause              = COALESCE(?, root_cause),
      effectiveness_verified  = COALESCE(?, effectiveness_verified),
      evidence_ref            = COALESCE(?, evidence_ref),
      updated_at              = ?
    WHERE id = ?
  `).run(
    description ?? null, owner ?? null, due_date ?? null,
    status ?? null, root_cause ?? null,
    evInt, evidence_ref ?? null,
    ts, car_id,
  );

  const updated = db.prepare("SELECT * FROM corrective_actions WHERE id = ?").get(car_id) as CarRow;
  return ok(shapeCar(updated));
}

// ── generate_audit_report ─────────────────────────────────────

export function handleGenerateAuditReport(args: Record<string, unknown>): ToolResult {
  const { audit_id, format } = args as { audit_id: string; format: string };

  const audit = requireAudit(audit_id);
  const db = getDb();

  // Fetch findings with their corrective actions
  const findings = db.prepare(
    "SELECT * FROM findings WHERE audit_id = ? ORDER BY type, created_at"
  ).all(audit_id) as FindingRow[];

  const cars = findings.length > 0
    ? db.prepare(
        `SELECT * FROM corrective_actions WHERE finding_id IN (${findings.map(() => "?").join(",")}) ORDER BY created_at`
      ).all(...findings.map((f) => f.id)) as CarRow[]
    : [];

  const carsByFinding = new Map<string, CarRow[]>();
  for (const car of cars) {
    const existing = carsByFinding.get(car.finding_id) ?? [];
    existing.push(car);
    carsByFinding.set(car.finding_id, existing);
  }

  const countByType = (type: string) => findings.filter((f) => f.type === type).length;

  if (format === "json") {
    return ok({
      audit: shapeAudit(audit),
      summary: {
        total_findings: findings.length,
        nc_count: countByType("nc"),
        obs_count: countByType("obs"),
        ofi_count: countByType("ofi"),
        total_cars: cars.length,
      },
      findings: findings.map((f) => ({
        ...f,
        corrective_actions: (carsByFinding.get(f.id) ?? []).map(shapeCar),
      })),
    });
  }

  // Markdown format
  const generatedDate = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    `# Audit Report: ${audit.name}`,
    ``,
    `## Executive Summary`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Audit Name | ${audit.name} |`,
    `| Auditor | ${audit.auditor} |`,
    `| Planned Date | ${audit.planned_date} |`,
    `| Status | ${audit.status} |`,
    `| Scope | ${audit.scope} |`,
    `| Total Findings | ${findings.length} |`,
    `| Non-Conformities (NC) | ${countByType("nc")} |`,
    `| Observations (OBS) | ${countByType("obs")} |`,
    `| Opportunities for Improvement (OFI) | ${countByType("ofi")} |`,
    ``,
    `## Findings`,
    ``,
    `| Type | Clause/Control | Severity | Description | Objective Evidence |`,
    `|------|---------------|----------|-------------|-------------------|`,
    ...findings.map((f) =>
      `| ${f.type.toUpperCase()} | ${f.clause_or_control} | ${f.severity ?? "—"} | ${f.description} | ${f.objective_evidence} |`
    ),
    ``,
    `## Corrective Action Report (CAR) Status`,
    ``,
    `| Finding | Owner | Due Date | Status | Effectiveness Verified |`,
    `|---------|-------|----------|--------|----------------------|`,
    ...cars.map((car) => {
      const finding = findings.find((f) => f.id === car.finding_id);
      const findingLabel = finding
        ? `${finding.type.toUpperCase()}: ${finding.clause_or_control}`
        : car.finding_id;
      return `| ${findingLabel} | ${car.owner} | ${car.due_date} | ${car.status} | ${car.effectiveness_verified ? "Yes" : "No"} |`;
    }),
    ``,
    `---`,
    ``,
    `Generated: ${generatedDate} | Audit ID: ${audit.id}`,
  ];

  return ok({ format: "markdown", content: lines.join("\n") });
}
