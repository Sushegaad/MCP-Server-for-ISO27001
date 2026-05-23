---
policy_type: access_control
clause_mappings: ["6.1.2","6.1.3"]
control_mappings: ["5.15","5.16","5.17","5.18","8.2","8.3","8.4","8.5"]
---
# Access Control Policy

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Principles
4. Access Management Lifecycle
5. Authentication Requirements
6. Privileged Access
7. Remote Access
8. Third-Party Access
9. Document Control

---

## 1. Purpose

This Access Control Policy establishes requirements for controlling access to information systems, applications, networks, and data within {{organisation_name}} to protect against unauthorised access.

## 2. Scope

{{scope}}

## 3. Principles

Access control within {{organisation_name}} is based on the following principles:

- **Least Privilege**: Users are granted the minimum access rights necessary to perform their job functions
- **Need to Know**: Access to information is restricted to those with a legitimate business need
- **Default Deny**: Access is denied unless explicitly authorised
- **Separation of Duties**: Conflicting responsibilities are divided among multiple users

## 4. Access Management Lifecycle

### 4.1 Provisioning
- All access requests must be submitted through the formal access request process
- Requests must be authorised by the user's line manager and the relevant system owner
- Access is granted only after all approvals are obtained and documented
- New access is provisioned within the agreed service level timeline

### 4.2 Review
- User access rights shall be reviewed at a minimum of every 12 months
- Privileged access rights shall be reviewed every 6 months
- Reviews are conducted by system owners and results documented

### 4.3 Modification
- Changes to job role or responsibilities require immediate reassessment of access rights
- Temporary access must have a defined expiry date

### 4.4 Revocation
- Access shall be revoked immediately upon termination of employment or contract
- Access shall be adjusted promptly upon change of role
- {{owner}} maintains a process for emergency access revocation

## 5. Authentication Requirements

- All users must authenticate using a unique user ID and strong password
- Passwords must meet the complexity requirements defined in the Authentication Standard
- Multi-factor authentication (MFA) is required for:
  - Remote access to all systems
  - Access to privileged accounts
  - Access to systems containing sensitive or classified information
- Shared or generic accounts are prohibited except where technically unavoidable, and require compensating controls

## 6. Privileged Access

- Privileged accounts must be separate from standard user accounts
- Privileged access must be used only for tasks requiring elevated rights
- All privileged access sessions must be logged
- Privileged account credentials must be stored in an approved privileged access management solution

## 7. Remote Access

- Remote access to {{organisation_name}} systems requires use of an approved VPN or equivalent secure channel
- Remote access sessions must authenticate using MFA
- Remote working devices must comply with the Endpoint Security Standard

## 8. Third-Party Access

- Third-party access must be formally authorised and documented
- Third parties must be subject to a confidentiality agreement before access is granted
- Third-party access must be time-limited and reviewed regularly
- Third-party access activities must be logged and monitored


{{> revision_block}}

{{> approver_signature}}
