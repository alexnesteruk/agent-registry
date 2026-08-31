# agent-registry

Single source of truth for AI agents, skills, and personas, authored once here and synced out to every AI CLI/IDE you use.

## Directory structure

```
agent-registry/
├── agents/       ← agent definitions (YAML frontmatter + system prompt)
├── skills/       ← skill definitions (become slash commands / invocable skills)
├── personas/     ← behavioral personas, compiled into Copilot and Gemini
├── guidelines/   ← long-form playbooks referenced by agents (e.g. war_room_playbook.md)
├── scripts/
│   ├── sync.sh                       ← run this after any change to agents/skills/personas
│   ├── sync.test.sh                  ← sync.sh's test suite
│   └── snitch_risk.py (+ .test.py)   ← fantasy-football draft turn-survival calculator
├── .github/copilot-instructions.md   ← auto-generated, don't edit directly
├── package.json
└── TODO.md       ← known gaps and unverified assumptions
```

Alongside the general-purpose agents, the registry hosts a **fantasy-football war-room subsystem** —
5 agents (`draft-commander` + 4 specialists), 5 skills (`build-cheat-sheet`, `draft-command`,
`resume-fantasy`, `adp-checker`, `roster-audit`), `guidelines/war_room_playbook.md`, and
`scripts/snitch_risk.py`. Its league data lives separately in `~/fantasy-football/`.

## Sync targets

Running `./scripts/sync.sh` pushes everything out:

| CLI | Gets | Location |
|---|---|---|
| Claude Code | agents + skills (as slash commands) | `~/.claude/agents/`, `~/.claude/commands/` |
| OpenCode | agents + skills + personas | `~/.opencode/agents/`, `~/.opencode/skills/`, `~/.opencode/personas/` |
| Antigravity | agents + skills | `~/.agents/agents/{name}/agent.md`, `~/.agents/skills/{name}/SKILL.md` |
| Gemini | personas only (compiled) | `~/.gemini/GEMINI.md` |
| GitHub Copilot | agents (as custom `.agent.md`) + personas (compiled) | `~/.copilot/agents/`, `.github/copilot-instructions.md` |

Each CLI has a different native tool-permission format, so `sync.sh` translates the `tools:` field in `agents/*.md` per target (see `translate_tools_for_claude` / `translate_tools_for_opencode` / `translate_tools_for_copilot` in the script). Antigravity's translation is still unverified; see `TODO.md`.

## How to use it

**Add or edit an agent:** create/edit a file in `agents/`, following the format of an existing one (frontmatter: `name`, `description`, `model`, `tools` required; `persona`, `skills` optional; body: a short second-person bullet list of concrete behaviors). Run `./scripts/sync.sh` afterward. New agents won't show up in a CLI's subagent list until you start a fresh session there.

**Add or edit a skill:** create/edit a file in `skills/` (frontmatter: `name`, `description`, `arguments`; body: the prompt template). Run `./scripts/sync.sh`.

**Add or edit a persona:** create/edit a file in `personas/`. Personas are referenced by name from an agent's `persona:` field, and compiled directly into Copilot/Gemini instructions.

**After any change:** run `./scripts/sync.sh` from the repo root. It's idempotent, safe to run anytime.

## Known gaps

See `TODO.md` for open questions (mainly around Antigravity's real tool-permission mechanism, and a couple of pre-existing inconsistencies in `expert-react-frontend-developer.md`).
