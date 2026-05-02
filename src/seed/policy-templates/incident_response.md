---
policy_type: incident_response
clause_mappings: ["6.1.2"]
control_mappings: ["5.24","5.25","5.26","5.27","5.28","6.8"]
---
# Information Security Incident Response Policy

**Organisation:** {{organisation_name}}
**Policy ID:** {{policy_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}

---

## 1. Purpose

This policy establishes the framework for detecting, reporting, assessing, responding to, and learning from information security incidents within {{organisation_name}}.

## 2. Scope

{{scope}}

## 3. Definitions

- **Event**: An identified occurrence indicating a possible breach of information security policy or failure of controls
- **Incident**: An event that has been assessed as having an actual adverse impact on information security
- **Major Incident**: An incident with significant business impact requiring escalation to senior management

## 4. Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Confirmed breach of sensitive data; significant system compromise; active attack | Immediate (within 1 hour) |
| High | Suspected breach; significant disruption to critical systems; ransomware | Within 4 hours |
| Medium | Unauthorised access attempt; malware detection; significant policy violation | Within 24 hours |
| Low | Minor policy violation; unsuccessful attack; suspicious activity | Within 5 business days |

## 5. Incident Response Process

### 5.1 Detection and Reporting
All personnel are required to report suspected security events immediately. Reports should be made to {{owner}} via the designated incident reporting channel.

### 5.2 Initial Assessment
{{owner}} or the designated Incident Response Team (IRT) will assess the reported event within the response time defined for its severity classification.

### 5.3 Containment
Immediate steps to limit the impact of confirmed incidents, which may include isolating affected systems, revoking compromised credentials, or blocking malicious traffic.

### 5.4 Eradication
Identifying and eliminating the root cause of the incident, including removing malware, closing vulnerabilities, and resetting compromised credentials.

### 5.5 Recovery
Restoring affected systems and services to normal operation, verifying that systems are clean and operational.

### 5.6 Post-Incident Review
A post-incident review shall be conducted for all High and Critical incidents within 14 days of resolution to identify:
- Root cause and contributing factors
- Effectiveness of the response
- Improvements to controls or procedures
- Lessons learned to be shared

## 6. Evidence Collection

Evidence shall be collected and preserved for all incidents where:
- Legal or regulatory notification may be required
- Disciplinary action may result
- The incident may be referred to law enforcement

Evidence must be handled in accordance with the Evidence Collection Procedure to maintain chain of custody.

## 7. Regulatory Notification

{{organisation_name}} shall notify relevant regulatory authorities of data breaches within the timeframes required by applicable legislation. {{owner}} is responsible for determining notification obligations and managing communications with regulators.

## 8. Communication

All communications regarding incidents shall be coordinated through {{owner}}. Personnel must not discuss incidents with external parties (including media) without explicit authorisation.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*
