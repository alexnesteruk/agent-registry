# TODO

## Verify Antigravity's real `tools:`/permission mechanism (added 2026-07-20)

`sync.sh` copies `agents/*.md` verbatim into `~/.agents/agents/{name}/agent.md`, and the
agents do surface in the Antigravity app (confirmed by observation) — so the sync target
itself is right. What's unverified is the `tools:` field inside those files:

- Does Antigravity read/enforce it at all, or is the agent granted some default toolset
  regardless of what's listed (same failure mode Claude Code and OpenCode had before their
  translation was added)?
- If it is enforced, what's the real vocabulary? One community example (GitHub discussion,
  not official docs) showed a JSON `agent.json` with `config.customAgent.toolNames` using
  names like `view_file`, `list_dir`, `grep_search`, `find_by_name`, `read_url_content`,
  `search_web`, `send_message`, `schedule` — quite different from this library's generic
  vocabulary (`read_file`, `write_file`, `run_terminal_cmd`, `web_search`), and in JSON, not
  `.md` frontmatter. Not confirmed to apply to `agent.md`.

Until this is confirmed, `sync.sh`'s Antigravity agent sync stays an untranslated plain
copy (see `translate_tools_for_claude` / `translate_tools_for_opencode` in `scripts/sync.sh`
for the pattern once the real mechanism is known).

**How to verify:** create a test agent with a deliberately narrow `tools:` list, invoke it
in the Antigravity app, and check whether it can actually use tools outside that list. If
it can, the field is inert and should either be translated to whatever the real mechanism
is, or dropped from what's synced to avoid implying a restriction that isn't real.

## Other known gaps

- `expert-react-frontend-developer.md` uses VS Code/Copilot-specific tool names in its
  `tools:` field (not this library's generic vocabulary), and lacks `persona`/`model`
  fields other agents have. Not normalized yet — would need its own translation target
  (VS Code Copilot) if it's ever invoked as a subagent through Claude Code or OpenCode.
- The project-local `.opencode/agents` and `.opencode/skills` symlinks (used when running
  OpenCode inside this repo) point directly at the source `agents/`/`skills/` dirs, so they
  serve the untranslated generic vocabulary — only the global `~/.opencode/agents/` copy
  gets the `permission:` translation. Symlinking means per-target translation isn't
  possible without giving up the "edits are instant, no sync needed" convenience locally.
