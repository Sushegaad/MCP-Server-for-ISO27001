---
template_type: incident_post_mortem
clause_mappings: ["10.1","10.2"]
control_mappings: ["5.24","5.25","5.26","5.27","5.28"]
---
# Incident Post-Mortem Report

{{> org_header}}

---

## 1. Executive Summary

| Field | Detail |
|---|---|
| Incident Title | {{incident_title}} |
| Incident Date | {{incident_date}} |
| Severity | {{severity}} |
| Duration | {{incident_duration}} |
| Systems Affected | {{affected_systems}} |
| Incident Commander | {{incident_commander}} |
| Report Date | {{generated_date}} |

**One-line summary:** {{executive_summary}}

---

## 2. Incident Timeline

| Time | Event |
|---|---|
| {{detection_time}} | Incident first detected |
| {{triage_time}} | Triage initiated |
| {{containment_time}} | Containment achieved |
| {{resolution_time}} | Incident resolved / service restored |
| {{closure_time}} | Post-mortem completed |

**Full chronological timeline:**

{{detailed_timeline}}

---

## 3. Root Cause Analysis

### 3.1 Immediate Cause

{{immediate_cause}}

### 3.2 Contributing Factors

{{contributing_factors}}

### 3.3 Root Cause

{{root_cause}}

*The root cause is the fundamental deficiency in the ISMS or technical control that allowed this incident to occur.*

---

## 4. Impact Assessment

### 4.1 Confidentiality Impact

{{confidentiality_impact}}

### 4.2 Integrity Impact

{{integrity_impact}}

### 4.3 Availability Impact

{{availability_impact}}

### 4.4 Data Subject / Customer Impact

{{data_subject_impact}}

### 4.5 Regulatory / Legal Obligations Triggered

{{regulatory_obligations}}

*Document any personal data breach notifications, regulator reports, or contractual obligations triggered by this incident.*

---

## 5. Containment and Recovery Actions

### 5.1 Immediate Containment Steps Taken

{{containment_steps}}

### 5.2 Recovery Steps Taken

{{recovery_steps}}

### 5.3 Evidence Preserved

{{evidence_preserved}}

---

## 6. Lessons Learned

{{lessons_learned}}

---

## 7. Corrective and Preventive Actions

| # | Action | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | {{action_1}} | {{action_1_owner}} | {{action_1_due}} | Open |
| 2 | {{action_2}} | {{action_2_owner}} | {{action_2_due}} | Open |
| 3 | {{action_3}} | {{action_3_owner}} | {{action_3_due}} | Open |

*Add rows as needed. Link each action to a corrective_action record in the ISMS.*

---

## 8. Participants

| Name | Role | Contribution |
|---|---|---|
| {{incident_commander}} | Incident Commander | Overall coordination |
| {{participants}} | *(see attached attendee list)* | *(see attached)* |

---

## 9. Sign-Off

| Field | Value |
|---|---|
| Incident Commander | {{incident_commander}} |
| CISO | {{ciso}} |
| ISMS Manager | {{isms_manager}} |
| DPO (if applicable) | {{dpo}} |
| Report Date | {{generated_date}} |


{{> approver_signature}}
