---
policy_type: risk_management
clause_mappings: ["6.1.1","6.1.2","6.1.3","8.2","8.3"]
control_mappings: ["5.1","5.7","5.31"]
---
# Information Security Risk Management Policy

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Risk Criteria
4. Risk Assessment Process
5. Risk Treatment
6. Risk Register
7. Roles and Responsibilities
8. Document Control

---

## 1. Purpose

This policy establishes the framework for identifying, assessing, treating and monitoring information security risks within {{organisation_name}} in accordance with ISO/IEC 27001:2022 clause 6.1.

## 2. Scope

{{scope}}

## 3. Risk Criteria

### 3.1 Likelihood Scale
| Level | Score | Description |
|-------|-------|-------------|
| Rare | 1 | May occur only in exceptional circumstances (< once in 5 years) |
| Unlikely | 2 | Could occur but not expected (once in 2–5 years) |
| Possible | 3 | Might occur at some time (once per year) |
| Likely | 4 | Will probably occur in most circumstances (several times per year) |
| Almost Certain | 5 | Expected to occur frequently (monthly or more) |

### 3.2 Impact Scale
| Level | Score | Description |
|-------|-------|-------------|
| Negligible | 1 | Minimal impact, no significant disruption |
| Minor | 2 | Limited impact, short-term disruption, manageable |
| Moderate | 3 | Significant impact, extended disruption, moderate cost |
| Major | 4 | Serious impact, extended disruption, significant cost or regulatory consequence |
| Catastrophic | 5 | Critical impact, business threatening, major regulatory consequences |

### 3.3 Risk Level Matrix
| Risk Score | Level | Treatment Required |
|-----------|-------|-------------------|
| 1–4 | Low | Monitor; treat if cost-effective |
| 5–9 | Medium | Implement treatment plan within 90 days |
| 10–16 | High | Immediate treatment plan required (30 days) |
| 17–25 | Critical | Immediate escalation to senior management; treatment within 14 days |

### 3.4 Risk Acceptance Criteria
Risks rated Low or Medium may be accepted by the relevant risk owner with documented justification. Risks rated High or Critical require approval from {{approver}} before acceptance.

## 4. Risk Assessment Process

### 4.1 Frequency
- Full risk assessment: at least annually
- Targeted assessment: triggered by significant changes (new systems, processes, threats, incidents)
- Scope: all information assets within the ISMS scope

### 4.2 Risk Identification
For each asset in scope, identify threats and vulnerabilities that could result in loss of confidentiality, integrity, or availability.

### 4.3 Risk Analysis
Calculate risk score = Likelihood × Impact. Document in the Risk Register.

### 4.4 Risk Evaluation
Compare risk score against acceptance criteria. Prioritise risks for treatment.

## 5. Risk Treatment

Risk treatment options:
- **Modify (Mitigate)**: Implement controls to reduce likelihood or impact
- **Retain (Accept)**: Accept the risk with documented justification from the risk owner
- **Avoid**: Eliminate the risk source (e.g. discontinue the activity)
- **Share (Transfer)**: Transfer part of the risk to a third party (e.g. insurance, outsourcing)

All risk treatment plans must be documented with: treatment option, controls to be implemented, responsible owner, target completion date, and expected residual risk.

## 6. Risk Register

{{organisation_name}} maintains a Risk Register documenting all identified risks, their assessment scores, treatment decisions, and residual risk. The Risk Register is reviewed and updated at least annually and whenever significant changes occur.

## 7. Roles and Responsibilities

- **{{owner}}**: Maintains the risk management process, Risk Register, and facilitates risk assessments
- **Risk Owners**: Business managers responsible for accepting or treating risks within their domains
- **{{approver}}**: Approves acceptance of High and Critical risks; reviews risk treatment plans


{{> revision_block}}

{{> approver_signature}}
