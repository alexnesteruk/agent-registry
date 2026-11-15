# agent-registry

Single source of truth for AI agents and skills, authored once here and synced out to every AI CLI/IDE you use.

## Directory structure

```
agent-registry/
├── agents/       ← agent definitions (YAML frontmatter + system prompt)
├── skills/       ← skill definitions (become slash commands / invocable skills)
├── guidelines/   ← long-form playbooks referenced by agents (e.g. war_room_playbook.md)
├── src/sync.ts   ← the sync tool (TypeScript, runs natively on Node ≥23.6)
├── test/         ← Vitest suite: unit + integration
├── scripts/
│   └── snitch_risk.py (+ .test.py)   ← fantasy-football draft turn-survival calculator
├── package.json
└── TODO.md       ← known gaps and unverified assumptions
```

Alongside the general-purpose agents, the registry hosts a **fantasy-football war-room subsystem** —
5 agents (`draft-commander` + 4 specialists), 5 skills (`build-cheat-sheet`, `draft-command`,
`resume-fantasy`, `adp-checker`, `roster-audit`), `guidelines/war_room_playbook.md`, and
`scripts/snitch_risk.py`. Its league data lives separately in `~/fantasy-football/`.

## Sync targets

Running `npm run sync` pushes everything out:

| CLI | Gets | Location |
|---|---|---|
| Claude Code | agents + skills (as slash commands) | `~/.claude/agents/`, `~/.claude/commands/` |
| OpenCode | agents + skills | `~/.opencode/agents/`, `~/.opencode/skills/` |
| Antigravity | agents + skills | `~/.agents/agents/{name}/agent.md`, `~/.agents/skills/{name}/SKILL.md` (the skills dir is also an official alias read by Gemini CLI and Copilot CLI) |
| Gemini CLI | agents (as custom subagents) + skills (via the `~/.agents/skills/` alias) | `~/.gemini/agents/` |
| GitHub Copilot | agents (as custom `.agent.md`) + skills (via the `~/.agents/skills/` alias) | `~/.copilot/agents/` |

Each CLI has a different native tool-permission format, so the sync tool translates the `tools:` field in `agents/*.md` per target (see the `translateToolsFor*` functions in `src/sync.ts`; the Gemini one also drops `model:` and the registry-only `persona:` key). Antigravity's translation is still unverified; see `TODO.md`.

## How to use it

**Add or edit an agent:** create/edit a file in `agents/`, following the format of an existing one (frontmatter: `name`, `description`, `model`, `tools` required; `skills` optional; body: a short second-person bullet list of concrete behaviors). Run `npm run sync` afterward. New agents won't show up in a CLI's subagent list until you start a fresh session there.

**Add or edit a skill:** create/edit a file in `skills/` (frontmatter: `name`, `description`, `arguments`; body: the prompt template). Run `npm run sync`.

**After any change:** run `npm run sync` from the repo root. It's idempotent, safe to run anytime. Tests: `npm test` (Vitest); `npm run typecheck`. CI runs both on every push.

## Known gaps

See `TODO.md` for open questions (mainly whether Antigravity and Gemini actually enforce the `tools:` restriction at runtime, and the Copilot tool-name mapping).
