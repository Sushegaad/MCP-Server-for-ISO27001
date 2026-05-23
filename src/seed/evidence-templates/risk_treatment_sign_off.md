---
template_type: risk_treatment_sign_off
clause_mappings: ["6.1.3","8.3","9.1"]
control_mappings: ["5.1","5.2"]
---
# Risk Treatment Plan — Owner Sign-Off Form

{{> org_header}}

---

## 1. Purpose

This form records the formal acceptance and sign-off of a risk treatment plan by the designated risk owner at **{{organisation_name}}**, in accordance with ISO 27001:2022 Clause 6.1.3 (Information security risk treatment) and Clause 8.3 (Information security risk treatment).

Risk treatment sign-off is required before a treatment plan is considered formally approved and before residual risk is accepted.

---

## 2. Risk Summary

| Field | Detail |
|---|---|
| Risk ID | {{risk_id_ref}} |
| Risk Title | {{risk_title}} |
| Asset | {{asset}} |
| Threat | {{threat}} |
| Vulnerability | {{vulnerability}} |
| Inherent Risk Score | {{inherent_risk_score}} |
| Inherent Risk Level | {{inherent_risk_level}} |
| Risk Register Reference | {{risk_register_ref}} |

---

## 3. Risk Description

{{risk_description}}

---

## 4. Treatment Plan

| Field | Detail |
|---|---|
| Treatment Type | {{treatment_type}} |
| Treatment Description | {{treatment_description}} |
| Implementing Controls | {{implementing_controls}} |
| Treatment Owner | {{owner_name}} |
| Target Completion Date | {{target_completion_date}} |
| Budget / Resources Required | {{budget_resources}} |

**Treatment type options:** Mitigate / Accept / Avoid / Transfer

---

## 5. Residual Risk Assessment

| Field | Detail |
|---|---|
| Residual Likelihood (1–5) | {{residual_likelihood}} |
| Residual Impact (1–5) | {{residual_impact}} |
| Residual Risk Score | {{residual_risk_score}} |
| Residual Risk Level | {{residual_risk_level}} |

**Risk appetite threshold:** {{risk_appetite_threshold}}

**Residual risk within appetite?** {{within_risk_appetite}}

---

## 6. Monitoring and Review

| Field | Detail |
|---|---|
| KPI / Metric | {{treatment_kpi}} |
| Measurement Frequency | {{measurement_frequency}} |
| Next Review Date | {{next_review_date}} |
| Responsible for Monitoring | {{monitoring_owner}} |

---

## 7. Risk Owner Acknowledgement

By signing below, the risk owner confirms that:

- They have reviewed and understood the risk described above.
- They accept responsibility for implementing the treatment plan within the agreed timescales.
- They accept the residual risk level as documented.
- They commit to reporting material deviations or escalations to the ISMS Manager promptly.

| Field | Value |
|---|---|
| Risk Owner Name | {{owner_name}} |
| Risk Owner Role | {{owner_role}} |
| Signature | *(electronic or wet signature)* |
| Date | {{sign_off_date}} |

---

## 8. ISMS Manager / CISO Approval

| Field | Value |
|---|---|
| Approver Name | {{approver_name}} |
| Approver Role | {{approver_role}} |
| Decision | {{approval_decision}} |
| Comments | {{approval_comments}} |
| Signature | *(electronic or wet signature)* |
| Date | {{sign_off_date}} |


{{> approver_signature}}
