---
procedure_type: backup_restore
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["8.13","8.6","5.30"]
---
# Backup and Restore Procedure

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Backup Schedule and Retention
4. Roles and Responsibilities
5. Backup Process
6. Restore Process
7. Restore Testing
8. Record Keeping
9. Document Control

---

## 1. Purpose

This procedure defines the backup schedules, retention policies, storage requirements, and restore processes for information systems at {{organisation_name}}, ensuring data can be recovered following loss, corruption, or disaster.

## 2. Scope

{{scope}}

## 3. Backup Schedule and Retention

| Data Classification | Frequency | Retention | Offsite Copy |
|---|---|---|---|
| Critical (production databases, configuration) | Daily full + continuous incremental | 90 days | Required |
| Important (application data, user files) | Daily full | 30 days | Required |
| Standard (non-critical files) | Weekly full | 14 days | Recommended |

## 4. Roles and Responsibilities

- **{{owner}}**: Owns this procedure; ensures backup jobs are monitored
- **IT Operations**: Configures, monitors, and executes backup jobs
- **System Owners**: Define recovery time and recovery point objectives for their systems
- **IT Security**: Reviews encryption of backup media and offsite storage controls

## 5. Backup Process

### 5.1 Automated Backup Jobs
1. Backup jobs are configured and scheduled in the approved backup management tool.
2. Each job specifies: target systems, backup type (full/incremental/differential), schedule, retention period, and destination (local + offsite).
3. Backup job configurations are reviewed and updated following any infrastructure change.

### 5.2 Encryption
1. All backups must be encrypted at rest using AES-256 or equivalent.
2. Encryption keys are managed separately from the backup data (stored in the approved key management system).
3. Backup media sent offsite must be encrypted before transit.

### 5.3 Offsite Storage
1. A copy of all critical and important backups is stored in a geographically separate location.
2. Offsite storage may be a cloud provider, colocation facility, or approved physical storage location.
3. Offsite storage providers must be subject to a supplier security assessment before use.

### 5.4 Monitoring Backup Jobs
1. IT Operations reviews backup job completion reports each business day.
2. Failed or incomplete backup jobs are investigated and remediated within 4 hours for critical data and 24 hours for other data.
3. Persistent failures are escalated to {{owner}}.
4. A weekly backup status summary is produced and retained as evidence.

## 6. Restore Process

### 6.1 Restore Request
1. A restore request is submitted via the ticketing system by an authorised requestor.
2. The request specifies: system, data set, point-in-time target, and business justification.
3. Restore requests for production systems require approval from the relevant System Owner.

### 6.2 Restore Execution
1. IT Operations identifies the appropriate backup set based on the requested recovery point.
2. Restore is performed in a test environment first (where time permits) to verify data integrity.
3. Production restore is executed during a maintenance window unless an emergency.
4. Each restore step is logged with timestamps and operator identity.

### 6.3 Verification
1. Post-restore, the System Owner or designated user verifies data integrity and application functionality.
2. Verification results are recorded in the restore ticket.
3. If verification fails, IT Operations attempts restore from an alternative backup set.

## 7. Restore Testing

1. Restore tests are conducted at least quarterly for critical systems and annually for other systems.
2. Tests verify that: the backup can be read, data is complete and uncorrupted, and the restore meets the defined Recovery Time Objective (RTO).
3. Test results are documented and reviewed by {{owner}}.
4. Failed tests trigger a review of the backup configuration and a follow-up test within 30 days.

## 8. Record Keeping

Backup job logs, monitoring reports, restore requests, and restore test results are retained for a minimum of 3 years.


{{> revision_block}}

{{> approver_signature}}
