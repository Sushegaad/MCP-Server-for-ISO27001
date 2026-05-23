---
template_type: training_acknowledgement
clause_mappings: ["7.2","7.3"]
control_mappings: ["6.3"]
---
# Security Awareness Training Acknowledgement Record

{{> org_header}}

---

## 1. Purpose

This record documents the completion of security awareness training at **{{organisation_name}}**, in accordance with ISO 27001:2022 Control 6.3 (Information security awareness, education and training) and Clause 7.2 (Competence) and 7.3 (Awareness).

All personnel whose roles have an information security impact are required to receive appropriate training and to acknowledge their understanding of relevant security policies and responsibilities.

## 2. Training Details

| Field | Detail |
|---|---|
| Training Title | {{training_title}} |
| Training Type | {{training_type}} |
| Training Date | {{training_date}} |
| Duration | {{training_duration_hours}} hour(s) |
| Delivery Method | {{delivery_method}} |
| Trainer / Provider | {{trainer_name}} |
| Location / Platform | {{training_platform}} |

## 3. Topics Covered

{{topics_covered}}

*Standard topics include: information security policy overview, acceptable use, password hygiene, phishing awareness, data classification, incident reporting, physical security, and individual responsibilities under the ISMS.*

## 4. Attendee Record

| Employee Name | Role / Department | Completion Date | Pass / Fail | Signature |
|---|---|---|---|---|
| {{employee_name}} | {{employee_role}} | {{training_date}} | {{completion_status}} | *(on file)* |

*Attach full attendee list if conducting group training.*

## 5. Assessment Results

{{assessment_results}}

*Document pass mark, individual scores, and re-training requirements for any failures.*

## 6. Employee Acknowledgement

By signing below, I confirm that:

- I have completed the training listed above.
- I understand my responsibilities under the **{{organisation_name}}** Information Security Policy.
- I will report any suspected security incidents or policy violations to the ISMS Manager.
- I understand that non-compliance may result in disciplinary action.

| Field | Value |
|---|---|
| Employee Name | {{employee_name}} |
| Employee Role | {{employee_role}} |
| Department | {{department}} |
| Signature | *(electronic or wet signature)* |
| Date | {{training_date}} |

## 7. ISMS Manager Sign-Off

| Field | Value |
|---|---|
| ISMS Manager | {{isms_manager}} |
| Reviewed Date | {{generated_date}} |


{{> approver_signature}}
