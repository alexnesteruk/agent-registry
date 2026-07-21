---
name: explain-code
description: Explain what a piece of code does, why it exists, and any non-obvious decisions
arguments:
  - name: code
    description: The code snippet or file to explain
    required: true
  - name: audience
    description: Target audience level (junior, senior, non-technical)
    required: false
---

# Explain Code

Explain the following code to a `{{audience}}` audience:

```
{{code}}
```

- Start with what it does in one sentence
- Then explain the *why* — the problem it solves or the constraint it respects
- Call out any non-obvious decisions, tradeoffs, or patterns
- Flag anything that looks like a bug, tech debt, or a footgun
- Keep it concise — no padding
