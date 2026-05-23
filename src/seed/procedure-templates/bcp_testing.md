---
procedure_type: bcp_testing
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.29","5.30","8.14"]
---
# Business Continuity Plan Testing Procedure

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Testing Types and Frequency
4. Roles and Responsibilities
5. Test Planning
6. Test Execution
7. Post-Test Review
8. Record Keeping
9. Document Control

---

## 1. Purpose

This procedure defines the planning, execution, and review of Business Continuity Plan (BCP) tests at {{organisation_name}}, ensuring that continuity arrangements remain effective, current, and executable by staff.

## 2. Scope

{{scope}}

## 3. Testing Types and Frequency

| Test Type | Description | Frequency |
|---|---|---|
| Tabletop Exercise | Discussion-based walkthrough of a scenario; no live systems | Annual (minimum) |
| Walkthrough Test | Team walks through BCP steps without activating; identifies gaps | Annual |
| Simulation Exercise | Realistic scenario enacted in a controlled environment | Every 2 years |
| Full Interruption Test | Actual failover to backup systems; production impact possible | Every 3 years or after major change |

## 4. Roles and Responsibilities

- **Business Continuity Coordinator ({{owner}})**: Plans and facilitates tests; owns this procedure
- **Senior Management Sponsor**: Authorises full interruption tests; receives test reports
- **Business Unit Leads**: Participate in tests; provide feedback on BCP practicality
- **IT Operations**: Executes technical failover steps during simulation and full interruption tests
- **Internal Audit**: Observes tests (where practical) and provides independent assessment

## 5. Test Planning

### 5.1 Annual Test Schedule
1. {{owner}} produces an annual BCP test schedule by the end of Q1 each year.
2. The schedule specifies: test type, date, scope, scenario, participants, and success criteria.
3. The schedule is approved by senior management and communicated to all participants.

### 5.2 Scenario Design
1. Scenarios are designed to be realistic and to test different threat categories (e.g., IT failure, facility loss, key person unavailability, supply chain disruption).
2. Scenarios are not disclosed to participants in advance for simulation and full interruption tests (to ensure an authentic response).
3. For tabletop and walkthrough tests, the scenario may be shared in advance.

### 5.3 Success Criteria
For each test, success criteria are defined in advance, including:
- Recovery Time Objective (RTO): maximum acceptable downtime for each critical function
- Recovery Point Objective (RPO): maximum acceptable data loss
- Staff activation: percentage of response team successfully contacted and mobilised
- Communication: stakeholder notifications issued within required timeframes

## 6. Test Execution

### 6.1 Pre-Test Activities
1. Notify participants of the test date and their role (without revealing the scenario for simulation tests).
2. Confirm that observers (Internal Audit, senior management) are available.
3. Prepare test observation checklists and measurement tools.
4. For full interruption tests: obtain explicit senior management sign-off; notify key external stakeholders if required; arrange monitoring of the production environment during failover.

### 6.2 During the Test
1. {{owner}} facilitates the exercise and keeps time records.
2. Observers record deviations from the BCP, decision points, and timing against success criteria.
3. For full interruption tests, IT Operations executes failover steps and records technical timings (failover initiation, system availability, rollback if needed).
4. Issues, near-misses, and improvisations are noted in real time.

### 6.3 Test Halt Criteria
A test is halted immediately if:
- A genuine emergency occurs
- The test poses unacceptable risk to production operations
- Senior management instructs a halt

Halts are documented with the reason and time.

## 7. Post-Test Review

### 7.1 Debrief
1. A debrief session is held within 5 business days of the test.
2. Participants review: what went well, what did not work as planned, and where the BCP requires updating.

### 7.2 Test Report
1. {{owner}} produces a Test Report within 15 business days of the test, covering:
   - Test type, date, scope, and scenario
   - Participants and observers
   - Results against success criteria (pass/fail for each objective)
   - Issues and observations
   - Improvement actions with owners and due dates
2. The Test Report is reviewed and approved by senior management.
3. The Test Report is retained as evidence.

### 7.3 BCP Updates
1. Improvement actions from the test are assigned owners and tracked in the action register.
2. BCP documents are updated to reflect lessons learned within 30 days of the Test Report approval.
3. Significant changes to the BCP are communicated to all relevant staff.

## 8. Record Keeping

Test plans, observation checklists, test reports, and action logs are retained for a minimum of 5 years.


{{> revision_block}}

{{> approver_signature}}
