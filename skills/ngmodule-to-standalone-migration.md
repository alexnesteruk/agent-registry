---
name: ngmodule-to-standalone-migration
description: Convert an Angular NgModule-based component or route into a standalone component using signals and new control-flow syntax
arguments:
  - name: source
    description: The NgModule, component, or route config to convert
    required: true
  - name: routing
    description: Whether the component is lazy-loaded via loadChildren and needs a loadComponent() route update
    required: false
---

# NgModule to Standalone Migration

Convert the following to a standalone Angular component:

```
{{source}}
```

- Remove the enclosing `NgModule` and set `standalone: true` (or drop the flag if targeting Angular 19+ where it's default)
- Move the module's `imports` array entries directly into the component's own `imports`
- Replace constructor-injected dependencies with `inject()`
- Convert `@Input()`/`@Output()` to signal-based `input()`/`output()` where the component isn't part of a public API that would break
- Replace `*ngIf`, `*ngFor`, `*ngSwitch` with `@if`, `@for` (with a `track` expression), `@switch`
- If `{{routing}}` indicates the component is lazy-loaded, update the route to use `loadComponent()` instead of `loadChildren()`
- Flag any remaining references to the deleted NgModule elsewhere in the codebase that also need updating
- Do not change component logic or template structure beyond what the migration requires
