---
template_type: bcp_test_report
clause_mappings: ["8.1"]
control_mappings: ["5.29","5.30"]
---
# Business Continuity Plan Test Report

{{> org_header}}

---

## 1. Purpose

This report documents the execution and results of a Business Continuity Plan (BCP) test conducted by **{{organisation_name}}**, in accordance with ISO 27001:2022 Controls 5.29 (Information security during disruption) and 5.30 (ICT readiness for business continuity).

Regular BCP testing is required to verify that continuity plans are effective, up-to-date, and executable within defined recovery time objectives.

---

## 2. Test Overview

| Field | Detail |
|---|---|
| Test Title | {{title}} |
| Test Date | {{test_date}} |
| Test Type | {{test_type}} |
| Test Coordinator | {{test_coordinator}} |
| Location | {{test_location}} |
| Duration | {{test_duration}} |
| BCP Version Tested | {{bcp_version}} |

**Test type options:** Tabletop exercise / Walkthrough / Functional test / Full simulation / Technical failover

---

## 3. Objectives

{{test_objectives}}

**Standard objectives:**
- Verify that recovery procedures can be executed within the defined RTO
- Confirm that staff understand their roles and responsibilities during a disruption
- Identify gaps or deficiencies in the current BCP
- Validate that backup systems and data restoration procedures are effective

---

## 4. Scope and Scenarios

### 4.1 Scenarios Tested

{{scenarios_tested}}

### 4.2 Systems and Processes in Scope

{{systems_in_scope}}

### 4.3 Out of Scope

{{out_of_scope}}

---

## 5. Participants

| Name | Role | Organisation |
|---|---|---|
| {{test_coordinator}} | Test Coordinator | {{organisation_name}} |
| {{participants}} | *(see attached attendee list)* | {{organisation_name}} |

---

## 6. Test Results

### 6.1 Recovery Time Objectives

| Process / System | Target RTO | Achieved RTO | Met? |
|---|---|---|---|
| {{process_1}} | {{rto_target_1}} | {{rto_achieved_1}} | {{rto_met_1}} |
| {{process_2}} | {{rto_target_2}} | {{rto_achieved_2}} | {{rto_met_2}} |

### 6.2 Recovery Point Objectives

| Data / System | Target RPO | Achieved RPO | Met? |
|---|---|---|---|
| {{data_1}} | {{rpo_target_1}} | {{rpo_achieved_1}} | {{rpo_met_1}} |

### 6.3 Objectives Met

{{objectives_met}}

### 6.4 Objectives Not Met

{{objectives_not_met}}

---

## 7. Issues Identified

| # | Issue | Severity | Recommended Action | Owner | Due Date |
|---|---|---|---|---|---|
| 1 | {{issue_1}} | {{issue_1_severity}} | {{issue_1_action}} | {{issue_1_owner}} | {{issue_1_due}} |
| 2 | {{issue_2}} | {{issue_2_severity}} | {{issue_2_action}} | {{issue_2_owner}} | {{issue_2_due}} |

---

## 8. Lessons Learned

{{lessons_learned}}

---

## 9. Recommended Plan Updates

{{plan_updates_required}}

---

## 10. Next Test

| Field | Detail |
|---|---|
| Recommended Next Test Type | {{next_test_type}} |
| Next Test Date | {{next_test_date}} |
| Areas to Focus | {{next_test_focus}} |

---

## 11. Sign-Off

| Field | Value |
|---|---|
| Test Coordinator | {{test_coordinator}} |
| ISMS Manager | {{isms_manager}} |
| CISO | {{ciso}} |
| Date | {{generated_date}} |


{{> approver_signature}}
