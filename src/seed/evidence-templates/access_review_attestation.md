---
template_type: access_review_attestation
clause_mappings: ["9.1","9.2"]
control_mappings: ["5.15","5.16","5.17","5.18","8.2","8.3"]
---
# Access Review Attestation

{{> org_header}}

---

## 1. Purpose

This attestation documents the completion of a periodic access review for **{{system_name}}** at **{{organisation_name}}**, in accordance with ISO 27001:2022 Controls 5.15 (Identity management), 5.18 (Access rights), 8.2 (Privileged access rights), and 8.3 (Information access restriction).

Access reviews ensure that access rights remain appropriate, are reviewed at defined intervals, and that unnecessary or excessive privileges are promptly revoked.

## 2. Scope

**ISMS Scope Statement:** {{isms_scope_statement}}

This review covers all active user accounts, service accounts, and privileged roles with access to **{{system_name}}** as at **{{review_date}}**.

## 3. Review Summary

| Item | Detail |
|---|---|
| System / Application | {{system_name}} |
| Total Accounts Reviewed | {{accounts_reviewed}} |
| Accounts Confirmed Appropriate | {{accounts_confirmed}} |
| Accounts Requiring Changes | {{accounts_requiring_changes}} |
| Accounts Revoked / Disabled | {{accounts_revoked}} |
| Privileged Accounts Reviewed | {{privileged_accounts_reviewed}} |

## 4. Access Changes Required

{{access_changes_required}}

*If no changes are required, state "None — all access rights confirmed appropriate."*

## 5. Findings and Observations

{{findings_and_observations}}

## 6. Exceptions and Justifications

{{exceptions_and_justifications}}

*Any exceptions to the access policy must be documented here with business justification and approval.*

## 7. Reviewer Sign-Off

I, **{{reviewer_name}}** ({{reviewer_role}}), confirm that I have reviewed the access rights for **{{system_name}}** for the period **{{review_period_start}}** to **{{review_period_end}}** and that the information recorded above is accurate and complete.

| Field | Value |
|---|---|
| Reviewer Name | {{reviewer_name}} |
| Reviewer Role | {{reviewer_role}} |
| Signature | *(electronic signature or wet signature attached)* |
| Date | {{review_date}} |


{{> approver_signature}}
