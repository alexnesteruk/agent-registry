# TODO

## Verify Antigravity's real `tools:`/permission mechanism (added 2026-07-20)

`sync.sh` copies `agents/*.md` verbatim into `~/.agents/agents/{name}/agent.md`, and the
agents do surface in the Antigravity app (confirmed by observation), so the sync target
itself is right. What's unverified is the `tools:` field inside those files:

- Does Antigravity read/enforce it at all, or is the agent granted some default toolset
  regardless of what's listed (same failure mode Claude Code and OpenCode had before their
  translation was added)?
- If it is enforced, what's the real vocabulary? One community example (GitHub discussion,
  not official docs) showed a JSON `agent.json` with `config.customAgent.toolNames` using
  names like `view_file`, `list_dir`, `grep_search`, `find_by_name`, `read_url_content`,
  `search_web`, `send_message`, `schedule`, quite different from this library's generic
  vocabulary (`read_file`, `write_file`, `run_terminal_cmd`, `web_search`), and in JSON, not
  `.md` frontmatter. Not confirmed to apply to `agent.md`.

Until this is confirmed, `sync.sh`'s Antigravity agent sync stays an untranslated plain
copy (see `translate_tools_for_claude` / `translate_tools_for_opencode` in `scripts/sync.sh`
for the pattern once the real mechanism is known).

**How to verify:** create a test agent with a deliberately narrow `tools:` list, invoke it
in the Antigravity app, and check whether it can actually use tools outside that list. If
it can, the field is inert and should either be translated to whatever the real mechanism
is, or dropped from what's synced to avoid implying a restriction that isn't real.

## Verify GitHub Copilot custom-agent `tools:` mapping (added 2026-07-21)

`translate_tools_for_copilot` in `scripts/sync.sh` maps `read_file`/`write_file`/`run_terminal_cmd`/`web_search` to `readFile`/`editFiles`/`runInTerminal`/`fetch`. Unlike Claude Code's mapping, this one is a best-effort guess from VS Code docs/blog posts, not empirically confirmed by observing an actual agent run. `web_search → fetch` is the weakest part: Copilot has no true web-search built-in, `fetch` only retrieves a specific URL.

Separately, `~/.copilot/agents/expert-react-frontend-developer.agent.md` (passed through untranslated, since its `tools:` already uses Copilot-style names) contains `"edit/editFiles"`. This exact prefixed notation is called out in a live GitHub issue (`microsoft/vscode-copilot-release#14104`, "Configure Tools UI writes incorrect tool names with prefix notation, corrupting custom agent files") as not recognized by the agent system. If that's accurate, this agent may silently be missing edit access in Copilot right now.

**How to verify:** open a synced agent (e.g. `angular-developer`) in Copilot Chat in WebStorm or VS Code, check the Tools icon to see which of its listed tools actually resolve vs. show as unrecognized. For the `edit/editFiles` case specifically, check whether `expert-react-frontend-developer` can actually edit files when invoked, or fix it to plain `editFiles` if the prefix form is confirmed broken.

## Other known gaps

- `expert-react-frontend-developer.md` uses VS Code/Copilot-specific tool names in its
  `tools:` field (not this library's generic vocabulary), and lacks `persona`/`model`
  fields other agents have. For OpenCode, `translate_tools_for_opencode` now translates
  this inline-array case to an explicit deny-all rather than silently dropping it (fixed
  2026-07-21, caught by `scripts/sync.test.sh`). For Claude Code, it's still unmapped and
  the agent gets no working tools if invoked as a subagent there, and the same fix pattern
  would apply if that's ever needed.
- No project-local `.opencode/agents`/`.opencode/skills` symlink exists anymore (removed
  2026-07-21). It's unnecessary: OpenCode resolves the global `~/.opencode/agents/` copy
  (translated, permission-mapped) from any cwd, confirmed via `opencode agent list` run
  from outside this repo. The symlink also actively broke every `opencode` command run
  inside this repo, since it exposed the untranslated source `tools:` array directly,
  which fails OpenCode's schema.

## Testing

`scripts/sync.test.sh` covers the translate_tools_for_* / strip_frontmatter functions
(fixture-based unit tests) plus one integration test that runs the real `main()` sync
against real source content with every global dir redirected to a temp directory. Run
with `bash scripts/sync.test.sh`. `sync.sh` is sourceable without side effects (`main()`
only runs when executed directly) specifically so this works.
