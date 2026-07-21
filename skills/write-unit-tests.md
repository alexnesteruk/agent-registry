---
name: write-unit-tests
description: Generate thorough unit tests for a function or component
arguments:
  - name: target
    description: The function, class, or component to test
    required: true
  - name: framework
    description: Test framework to use (e.g. Jasmine, Jest, Vitest)
    required: false
---

# Write Unit Tests

Generate thorough unit tests for `{{target}}`.

- Cover the happy path, edge cases, and error conditions
- Each test should have a single clear assertion focus
- Use descriptive `it('should ...')` names that read as documentation
- Mock only external dependencies (HTTP, timers, file system) — test real logic
- If `{{framework}}` is specified use it; otherwise infer from the project's dependencies
- Do not test implementation details; test observable behavior
