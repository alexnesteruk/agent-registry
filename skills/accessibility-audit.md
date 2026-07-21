---
name: accessibility-audit
description: Audit a component or page for WCAG 2.1 AA compliance — semantic HTML, ARIA, and keyboard navigation
arguments:
  - name: target
    description: The component, page, or markup to audit
    required: true
  - name: level
    description: Target conformance level (A, AA, AAA) — defaults to AA
    required: false
---

# Accessibility Audit

Audit the following for WCAG {{level}} compliance:

```
{{target}}
```

Check for (at minimum):
- Semantic HTML: correct use of landmarks, headings, `<button>` vs `<div onClick>`, labeled form controls
- ARIA: roles and attributes only where semantic HTML can't express the pattern; no redundant or conflicting ARIA
- Keyboard navigation: all interactive elements reachable and operable via keyboard, visible focus indicators, logical tab order
- Focus management: focus moved appropriately on route changes, modals, and dynamic content updates
- Color contrast: text and meaningful UI elements meet minimum contrast ratios for the target level
- Screen reader experience: meaningful alt text, live regions for dynamic updates, no content conveyed by color/icon alone

For each finding: state the WCAG success criterion violated, the exact location, and a concrete fix.
Rate each as **blocker**, **high**, **medium**, or **low**.
