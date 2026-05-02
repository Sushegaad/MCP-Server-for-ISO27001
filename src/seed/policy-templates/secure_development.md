---
policy_type: secure_development
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["8.25","8.26","8.27","8.28","8.29","8.30","8.31","8.32","8.33","8.34"]
---
# Secure Development Policy

**Organisation:** {{organisation_name}}
**Policy ID:** {{policy_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}

---

## 1. Purpose

This policy establishes requirements for secure software and system development practices at {{organisation_name}} to ensure that security is integrated throughout the development lifecycle.

## 2. Scope

{{scope}}

## 3. Secure Development Lifecycle

Security shall be integrated into all phases of the development lifecycle:

### 3.1 Requirements Phase
- Security requirements must be identified and documented alongside functional requirements
- Requirements must address authentication, authorisation, input validation, output encoding, error handling, logging, and encryption
- Security requirements must reference applicable standards (OWASP, applicable regulations)
- Threat modelling shall be conducted for high-risk applications

### 3.2 Design Phase
- Security architecture reviews shall be conducted for significant new systems
- Design must follow secure architecture principles including defence in depth, least privilege, and fail-secure
- Security design decisions must be documented

### 3.3 Development Phase
- Developers must follow the Secure Coding Standard
- Code review (including security review) is mandatory before merging
- Sensitive data must not be hard-coded (credentials, keys, connection strings)
- Approved libraries and components only; third-party libraries must be assessed for known vulnerabilities

### 3.4 Testing Phase
- Security testing must be conducted before deployment to production
- Testing shall include static analysis (SAST), dynamic analysis (DAST), and dependency scanning
- Penetration testing is required for externally facing applications and significant new features
- Test results must be documented and remediated before release

### 3.5 Deployment Phase
- All changes to production must go through the change management process
- Deployment procedures must be documented
- Rollback procedures must be prepared and tested

### 3.6 Maintenance Phase
- Vulnerabilities discovered post-deployment must be tracked and remediated within defined SLAs
- Security patches must be applied in accordance with the vulnerability management policy
- System decommissioning must include secure data deletion

## 4. Environment Separation

Development, test, and production environments must be separated. Production data must not be used in development or test environments unless appropriately masked or anonymised. Access controls between environments must reflect the sensitivity of the environment.

## 5. Source Code Security

- Source code repositories must require authentication and access must be controlled
- All commits must be traceable to individual developers
- Secrets and credentials must never be committed to source code repositories
- Repository access must be reviewed periodically

## 6. Outsourced Development

Where development is outsourced:
- Security requirements must be contractually specified
- Code must be reviewed before deployment to production
- Source code ownership and access rights must be defined in the contract
- Security testing of outsourced code is required before use

## 7. Secure Coding Standards

{{organisation_name}} shall maintain a Secure Coding Standard addressing at minimum:
- OWASP Top 10 vulnerability categories
- Input validation and output encoding
- Authentication and session management
- Cryptographic practices
- Error handling and logging
- SQL injection and command injection prevention
- Cross-site scripting (XSS) prevention

Developers must complete secure coding training annually.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*
