---

## Document Control

{{#approver}}
| Field | Value |
|---|---|
| Document Owner | {{owner}} |
| Approved By | {{approver}} |
| Effective Date | {{effective_date}} |
{{#next_review_date}}| Next Review Date | {{next_review_date}} |
{{/next_review_date}}| Clause References | {{clause_mappings}} |
| Control References | {{control_mappings}} |

*Approved by: **{{approver}}** on {{effective_date}}{{#next_review_date}} · Next review: {{next_review_date}}{{/next_review_date}}*
{{/approver}}{{^approver}}
| Field | Value |
|---|---|
{{#isms_manager}}| ISMS Manager | {{isms_manager}} |
{{/isms_manager}}{{#ciso}}| CISO | {{ciso}} |
{{/ciso}}{{#dpo}}| DPO | {{dpo}} |
{{/dpo}}| Document Generated | {{generated_date}} |
| Clause References | {{clause_mappings}} |
| Control References | {{control_mappings}} |

*This document was generated under the **{{organisation_name}}** Information Security Management System.*
{{/approver}}

---

*This is a controlled document of the {{organisation_name}} ISMS. Printed or downloaded copies are uncontrolled. The authoritative version is maintained in the ISMS document repository.*
