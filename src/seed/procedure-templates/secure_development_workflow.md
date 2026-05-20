---
procedure_type: secure_development_workflow
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["8.25","8.26","8.27","8.28","8.29","8.30","8.31"]
---
# Secure Development Workflow Procedure

**Organisation:** {{organisation_name}}
**Procedure ID:** {{procedure_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}
**Parent Policy ID:** {{parent_policy_id}}

---

## 1. Purpose

This procedure defines secure coding practices, mandatory security checks in the software development lifecycle (SDLC), and controls for the development, testing, and deployment of software at {{organisation_name}}.

## 2. Scope

{{scope}}

## 3. Roles and Responsibilities

- **Developers**: Follow secure coding standards; resolve security findings before merge
- **Security Champion**: Embedded in the development team; advises on secure design; reviews high-risk changes
- **Lead Developer / Tech Lead**: Performs or delegates code review; ensures compliance with this procedure
- **DevSecOps / IT Security**: Configures and maintains automated security tooling; triages SAST/DAST findings
- **{{owner}}**: Owns this procedure; reports on SDLC security metrics

## 4. Secure Design

1. Security requirements are defined during the requirements phase for all new features and significant changes.
2. A threat model is produced for new systems and major architectural changes, identifying threats, mitigations, and residual risks.
3. Third-party libraries and frameworks are evaluated for known vulnerabilities before adoption (check NVD / OSV).
4. Security Champion reviews design documents for any component handling sensitive data or authentication.

## 5. Secure Coding Standards

Developers must adhere to the following minimum standards:

1. **Input Validation**: All input from external sources must be validated and sanitised. Parameterised queries (prepared statements) must be used for all database interactions.
2. **Authentication and Session Management**: Use proven authentication libraries; do not implement custom cryptography. Sessions must expire after inactivity.
3. **Authorisation**: Enforce authorisation on the server side; never rely on client-side controls alone.
4. **Error Handling**: Do not expose stack traces or internal system details in error responses to end users.
5. **Secrets Management**: Credentials, API keys, and cryptographic keys must never be hardcoded in source code or committed to version control. Use environment variables or an approved secrets manager.
6. **Dependency Management**: Use a lockfile (package-lock.json, Pipfile.lock, etc.) and review dependency updates for security implications before adoption.
7. **Logging**: Log security-relevant events (authentication, authorisation failures, data access) without logging sensitive data values.

## 6. Pre-Commit and Pre-Merge Checks

### 6.1 Static Application Security Testing (SAST)
1. SAST scanning is integrated into the CI pipeline and runs automatically on every pull request.
2. Critical and High severity findings block the merge.
3. Developers must resolve or obtain a documented risk acceptance for all blocking findings before merge.

### 6.2 Software Composition Analysis (SCA)
1. SCA tooling scans for known vulnerabilities in third-party dependencies on every pull request.
2. Critical and High severity vulnerabilities in direct dependencies block the merge.
3. Transitive dependency findings are tracked and remediated within the timelines defined in the Vulnerability Management Procedure.

### 6.3 Secret Scanning
1. Secret scanning tooling is configured in the CI pipeline and on the version control platform.
2. Detection of a committed secret immediately blocks the merge and triggers a mandatory rotation of the exposed credential.

## 7. Code Review

1. All code must be reviewed by at least one developer other than the author before merge.
2. Reviewers check for: logic errors, insecure patterns (injection, broken auth, insecure direct object references), adherence to secure coding standards, and appropriate test coverage.
3. High-risk changes (authentication, cryptography, payment flows, privilege escalation paths) require Security Champion sign-off in addition to peer review.
4. Code review approval is recorded in the version control platform.

## 8. Testing Environments

1. Production data must not be used in development or test environments.
2. Test environments must be isolated from production networks.
3. Where realistic data volumes are required, production data must be anonymised or synthetically generated before use in testing.

## 9. Dynamic Application Security Testing (DAST) and Penetration Testing

1. DAST scans are performed on staging environments before major releases.
2. Penetration testing of externally accessible applications is conducted at minimum annually, and after significant architectural changes, by an independent tester.
3. Penetration test findings are tracked in the vulnerability register and remediated per the Vulnerability Management Procedure.

## 10. Deployment and Release

1. Deployments to production follow the Change Management Procedure.
2. Container images and build artefacts are scanned for vulnerabilities before deployment.
3. Software bills of materials (SBOMs) are generated for each production release and retained.
4. Production deployments are logged with version, deployer identity, and timestamp.

## 11. Record Keeping

Threat models, SAST/SCA/DAST reports, code review records, penetration test reports, and deployment logs are retained for a minimum of 3 years.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*
