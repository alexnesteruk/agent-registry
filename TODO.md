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

`translate_tools_for_copilot` in `scripts/sync.sh` maps `read_file`/`write_file`/`run_terminal_cmd`/`web_search` to `readFile`/`editFiles`/`runInTerminal`/`fetch`. Unlike Claude Code's mapping, th[...]

Separately, `~/.copilot/agents/expert-react-frontend-developer.agent.md` (passed through untranslated, since its `tools:` already uses Copilot-style names) contains `"edit/editFiles"`. This exact [...]

**How to verify:** open a synced agent (e.g. `angular-developer`) in Copilot Chat in WebStorm or VS Code, check the Tools icon to see which of its listed tools actually resolve vs. show as unrecog[...]

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
(fixture-based unit tests) plus one integration test that runs the real `sync()`
against real source content with every global dir redirected to a temp directory. Run
with `bash scripts/sync.test.sh`. `sync.sh` is sourceable without side effects (`main()`
only runs when executed directly) specifically so this works.

## Future directions (added 2026-07-25)

Candidate next steps, roughly in priority order based on cost against benefit:

- **[ACTIVE PLANNING] Migrate to npmjs (added 2026-08-31).** Strategic priority: convert
  shell scripts to Node.js/npm for cross-platform support, better maintainability, and
  alignment with emerging standards. Will unlock Windows users, npm registry discoverability,
  and clearer path to `gh skill` compatibility.
  
  **Phase 1: Rewrite sync logic in JavaScript (2-3 days)**
  - [ ] Create `package.json` with dependencies (js-yaml, chalk, etc.)
  - [ ] Rewrite `scripts/sync.sh` → `src/sync.js` (1:1 feature parity)
  - [ ] Rewrite `scripts/sync.test.sh` → `test/sync.test.js` (Jest or Vitest)
  - [ ] Add platform detection for Windows/macOS/Linux
  - [ ] Handle path normalization (use `path` module instead of bash)
  - [ ] Ensure tool translation logic maps 1:1 from shell version
  
  **Phase 2: npm distribution & CLI (1 day)**
  - [ ] Add `bin` entry point in package.json → `bin/agent-registry.js`
  - [ ] Publish to npm registry
  - [ ] Test global install: `npm install -g agent-registry`
  - [ ] Create install/setup guide for npm users vs. git clone users
  - [ ] Add `.npmignore` to exclude source scripts
  
  **Phase 3: Advanced features & config (3-5 days)**
  - [ ] Add config file support (`agent-registry.config.js` or `.agent-registryrc`)
  - [ ] Implement selective sync (whitelist/blacklist like agent-skills-sync-tool)
  - [ ] Add CLI flags: `--dry-run`, `--verbose`, `--platforms` filter
  - [ ] Interactive setup wizard (use `inquirer` library)
  - [ ] Add progress bars and colored output (use `chalk`)
  - [ ] Update README with new workflow examples
  
  **Phase 4: Standards alignment & ecosystem (1-2 weeks)**
  - [ ] Adopt Agent Skills spec (https://agentskills.io)
  - [ ] Add version pinning + provenance metadata to package.json
  - [ ] Make compatible with `gh skill list/install` workflow
  - [ ] Support cloud platform sync (Playwright for Perplexity, Claude Desktop)
  - [ ] Add skill publishing workflow
  - [ ] Document how to use as npm library (import/require)
  
  **Benefits of this work:**
  - ✅ Cross-platform (Windows, macOS, Linux all equally supported)
  - ✅ Globally installable: `npm install -g agent-registry`
  - ✅ Easier maintenance (TypeScript/JS vs. bash + jq)
  - ✅ Better IDE support and testing
  - ✅ Align with `gh skill` standard (emerging official GitHub approach)
  - ✅ Competitive against agent-skills-sync-tool (adds selective sync) and opensite-skills (adds distribution)
  - ✅ Appeal to JavaScript/Node.js developer community
  - ✅ Enable npm library usage (not just CLI)
  
  **Research artifact:** Competitive analysis vs. agent-skills-sync-tool, opensite-skills, GitHub CLI
  (see: https://github.com/alexnesteruk/agent-registry/discussions/[TBD])

- **Package for external/team use.** Mostly overlaps with npm migration above. Requires
  generalizing away from hardcoded `$HOME`-relative assumptions and documenting for users
  with different target directory structures.

- **More sync targets** (Cursor, Windsurf, Zed, Cline, etc.). Benefit is the core value
  proposition, one edit propagates everywhere, but cost compounds per target: every
  tool's real mechanism has been a surprise so far (OpenCode's `permission:` map,
  Copilot's `tools:` schema, Antigravity's still-unverified enforcement above), so each
  addition is its own research-and-verify cycle plus a translator plus test coverage,
  not a copy-paste.

- **Auto-sync on save** (git hook or file watcher instead of remembering to run
  `sync.sh`). Low cost, direct benefit: removes the one manual step that's already
  caused real drift (the stale `SandBox17/.opencode` copy existed because nothing
  forced a re-sync, see "Other known gaps" above).

- **CI validation** (run sync tests in a GitHub Action on push). Low cost since the
  test suite already exists. Catches a translator regression before it reaches the real
  `~/.claude`/`~/.opencode`/etc. targets, instead of only being caught by hand, which is
  how the OpenCode crash and the silent tools-dropping bug were both found.

- **Extend beyond agents/skills/personas to MCP server configs.** There's already a real
  MCP entry wired into `~/.opencode/config.json` pointing at the sibling
  `agent-registry-mcp` repo. Folding that config into the same source-of-truth/sync
  pattern is a moderate lift but closes a real gap, that config isn't versioned or
  reproducible anywhere right now.
