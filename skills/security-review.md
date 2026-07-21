---
name: security-review
description: Review code or a diff for common security vulnerabilities
arguments:
  - name: target
    description: Code, diff, or file path to review
    required: true
---

# Security Review

Review the following for security vulnerabilities:

```
{{target}}
```

Check for (at minimum):
- Injection: SQL, command, LDAP, XPath
- Authentication/authorization bypass
- Sensitive data exposure (tokens, PII in logs or responses)
- Insecure direct object references
- Missing input validation at system boundaries
- Unsafe deserialization
- Dependency vulnerabilities (flag outdated or known-bad packages)

For each finding: state the vulnerability class, the exact location, the risk, and a concrete fix.
Rate each as **blocker**, **high**, **medium**, or **low**.
