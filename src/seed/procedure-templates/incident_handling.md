---
procedure_type: incident_handling
clause_mappings: ["6.1.2","9.1"]
control_mappings: ["5.24","5.25","5.26","5.27","5.28","6.8"]
---
# Incident Handling Procedure

**Organisation:** {{organisation_name}}
**Procedure ID:** {{procedure_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}
**Parent Policy ID:** {{parent_policy_id}}

---

## 1. Purpose

This procedure provides a structured, repeatable approach for detecting, reporting, assessing, containing, eradicating, and recovering from information security incidents at {{organisation_name}}.

## 2. Scope

{{scope}}

## 3. Incident Severity Classification

| Severity | Criteria | Response Time |
|---|---|---|
| P1 — Critical | Data breach, ransomware, full system compromise | 15 minutes |
| P2 — High | Partial system compromise, malware detected, significant data loss risk | 1 hour |
| P3 — Medium | Suspected phishing, policy violation, minor data exposure | 4 hours |
| P4 — Low | Anomalous activity with no confirmed impact | Next business day |

## 4. Roles and Responsibilities

- **Any Staff Member**: Report suspected incidents immediately
- **Service Desk / First Responder**: Initial triage and severity assignment
- **Incident Coordinator ({{owner}})**: Leads the incident response team
- **Technical Response Team**: Investigation, containment, and eradication
- **Senior Management**: Notified for P1/P2; authorise external communication
- **Legal / DPO**: Engaged for incidents involving personal data (GDPR obligation)

## 5. Incident Response Phases

### 5.1 Detection and Reporting
1. Any staff member who identifies a suspected security incident must report it immediately via:
   - Incident reporting form in the ticketing system, or
   - Direct call to the Service Desk (for urgent matters)
2. The report must include: date/time observed, systems involved, nature of the issue, and any actions already taken.
3. The Service Desk logs the incident, assigns an incident ticket, and performs initial triage within 30 minutes.

### 5.2 Triage and Classification
1. The First Responder reviews the report and classifies severity (P1–P4) using the table in Section 3.
2. For P1/P2: The Incident Coordinator and Technical Response Team are paged immediately.
3. For P3/P4: The incident is queued for the next available response window.
4. Classification is recorded in the incident ticket.

### 5.3 Containment
1. Short-term containment: Isolate affected systems from the network to prevent lateral movement (P1/P2: within 30 minutes of classification).
2. The Technical Response Team documents all containment actions with timestamps.
3. System images or forensic snapshots are taken before any remediation to preserve evidence.
4. Long-term containment: Implement compensating controls that allow continued operations while the root cause is investigated.

### 5.4 Investigation and Root Cause Analysis
1. The Technical Response Team collects logs, artefacts, and evidence from affected systems.
2. A timeline of events is constructed.
3. Root cause is identified and documented.
4. Scope of impact (systems, data, users affected) is assessed and documented.

### 5.5 Eradication
1. Remove the threat (malware, compromised credentials, vulnerability) from all affected systems.
2. Verify removal using appropriate tools (antivirus scan, integrity check, credential audit).
3. Patch or harden affected systems to prevent reoccurrence.

### 5.6 Recovery
1. Restore affected systems from clean backups or rebuild from a known-good state.
2. Conduct functional testing before returning systems to production.
3. Monitor restored systems intensively for at least 48 hours post-recovery.
4. Notify affected users and stakeholders when systems are confirmed safe.

### 5.7 Post-Incident Review
1. A post-incident review is conducted within 5 business days of closure for P1/P2 incidents, and within 10 business days for P3/P4.
2. The review produces a Post-Incident Report covering: timeline, root cause, impact, response effectiveness, and lessons learned.
3. Improvement actions are raised as tickets with owners and due dates.
4. The Post-Incident Report is retained as evidence.

## 6. Regulatory and Breach Notification

1. If personal data is involved, the DPO is notified within 1 hour of classification.
2. The DPO assesses whether the incident constitutes a personal data breach requiring notification to the supervisory authority (within 72 hours under GDPR).
3. Affected individuals are notified if the breach is likely to result in high risk to their rights and freedoms.
4. All regulatory communications are documented and retained.

## 7. Evidence Preservation

All logs, artefacts, and documentation collected during an incident must be preserved in a tamper-evident manner and retained for a minimum of 3 years.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*
