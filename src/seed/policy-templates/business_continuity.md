---
policy_type: business_continuity
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.29","5.30","8.13","8.14"]
---
# Information Security Business Continuity Policy

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Business Continuity Objectives
4. ICT Continuity Planning
5. Testing and Exercises
6. Plan Maintenance
7. Roles and Responsibilities
8. Document Control

---

## 1. Purpose

This policy establishes requirements for maintaining information security during business disruptions and ensuring the continuity of critical information systems and data at {{organisation_name}}.

## 2. Scope

{{scope}}

## 3. Business Continuity Objectives

{{organisation_name}} shall maintain information security at an appropriate level during disruption to ensure:
- Critical information systems can be recovered within defined recovery time objectives (RTOs)
- Information can be recovered to within defined recovery point objectives (RPOs)
- Security controls are maintained or compensating controls are applied during disruption
- Sensitive information is protected throughout the recovery period

## 4. ICT Continuity Planning

### 4.1 Business Impact Analysis
A Business Impact Analysis (BIA) shall be conducted to identify critical information systems and their RTOs and RPOs. The BIA shall be reviewed annually and when significant changes occur.

### 4.2 Recovery Strategies
Recovery strategies shall be defined and documented for all critical systems, including:
- Backup and recovery procedures
- Alternative processing arrangements
- Manual workaround procedures where systems are unavailable

### 4.3 Backup Requirements
- Critical data shall be backed up at a frequency that meets defined RPOs
- Backups shall be stored in a secure off-site location
- Backup integrity shall be verified regularly through restoration tests
- Backup and restoration procedures shall be documented

### 4.4 Redundancy
Critical information processing facilities shall be implemented with sufficient redundancy to meet availability requirements. Redundancy measures shall be tested regularly.

## 5. Testing and Exercises

Business continuity and ICT recovery plans shall be tested at planned intervals, at least annually, through:
- Tabletop exercises
- Technical recovery tests
- Full failover exercises (for critical systems)

Test results shall be documented and identified improvements shall be tracked to completion.

## 6. Plan Maintenance

Business continuity and ICT recovery plans shall be reviewed and updated:
- At least annually
- Following significant changes to systems or infrastructure
- Following activation of the plan
- Following changes to identified critical systems or RTOs/RPOs

## 7. Roles and Responsibilities

- **{{owner}}**: Maintains business continuity plans and coordinates exercises
- **System Owners**: Ensure recovery procedures exist for their systems
- **All Personnel**: Understand their roles during a business continuity event and follow established procedures


{{> revision_block}}

{{> approver_signature}}
