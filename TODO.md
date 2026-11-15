# TODO

## Verify Antigravity's real `tools:`/permission mechanism (added 2026-07-20)

The sync tool copies `agents/*.md` verbatim into `~/.agents/agents/{name}/agent.md`, and the
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

Until this is confirmed, the sync tool's Antigravity agent sync stays an untranslated plain
copy (see `translateToolsForClaude` / `translateToolsForOpencode` in `src/sync.ts`
for the pattern once the real mechanism is known).

**How to verify:** create a test agent with a deliberately narrow `tools:` list, invoke it
in the Antigravity app, and check whether it can actually use tools outside that list. If
it can, the field is inert and should either be translated to whatever the real mechanism
is, or dropped from what's synced to avoid implying a restriction that isn't real.

## Verify GitHub Copilot custom-agent `tools:` mapping (added 2026-07-21)

`translateToolsForCopilot` in `src/sync.ts` maps `read_file`/`write_file`/`run_terminal_cmd`/`web_search` to `readFile`/`editFiles`/`runInTerminal`/`fetch`. Unlike Claude Code's mapping, th[...]

(An earlier note here about `expert-react-frontend-developer.agent.md` passing through
untranslated no longer applies: that agent was normalized to the generic vocabulary on
2026-11-15 and is now translated like the others.)

**How to verify:** open a synced agent (e.g. `angular-developer`) in Copilot Chat in WebStorm or VS Code, check the Tools icon to see which of its listed tools actually resolve vs. show as unrecog[...]

## Verify Gemini CLI subagent sync (added 2026-11-15)

`translateToolsForGemini` in `src/sync.ts` writes agents to `~/.gemini/agents/*.md`,
mapping `run_terminal_cmd` → `run_shell_command` and `web_search` → `google_web_search`
(`read_file`/`write_file` already match). Tool names were confirmed against
geminicli.com/docs/core/subagents + the file-system and web-search tool pages, and by
grepping the installed gemini-cli 0.46.0 bundle. The docs state `tools:` restricts the
agent (omitted = inherits all). `model:` is dropped (our values are Claude ids; Gemini
defaults to `inherit`); `persona:` and `skills:` are dropped (registry-only keys).

**Verified 2026-11-15** by running `gemini skills list`, whose agent loader prints
validation errors for every file in `~/.gemini/agents/`. Gemini's schema is strict:
unknown keys are rejected (`Unrecognized key(s) in object: 'skills'`, which broke the
three agents carrying `skills:` on the first sync), every tool name is validated
(`tools.N: Invalid tool name`), and `name` must be a slug. Consequences now in the
translator: `skills:` is dropped alongside `model:`/`persona:`, and any agent with an
inline `tools: [...]` array is **skipped for Gemini** rather than written with `tools:`
removed, since a missing `tools:` inherits every tool (fail-open). That skip path
applied to `expert-react-frontend-developer.md` until it was normalized the same day
(see below); after normalization `gemini skills list` loads all 9 agents without
errors. The skip logic stays as the fail-safe for any future outlier.

Still unverified:

- Does Gemini actually *enforce* the `tools:` restriction at runtime? Schema-level
  validation is confirmed; invoke a synced agent with a narrow list and try a tool
  outside it to confirm enforcement.
- The Gemini docs note unpaid/Google One users were moved to **Antigravity CLI** on
  2026-06-18, and `~/.gemini/antigravity-cli/` exists locally. Whether Antigravity CLI
  reads `~/.gemini/agents/` (or `~/.agents/agents/`, which we already write) is unknown.

## expert-react-frontend-developer normalized (added 2026-11-15, RESOLVED same day)

Gemini rejected this agent (non-slug `name`, 21 unrecognized VS Code tool names) and it
was briefly skipped by the Gemini sync. Resolved by normalizing the agent itself rather
than special-casing Gemini: `name` is now the filename slug, `model: claude-sonnet-5`
added, and `tools:` rewritten as the generic block list (`read_file`, `write_file`,
`run_terminal_cmd`, `web_search`) every translator understands. One edit fixed Gemini,
OpenCode (was deny-all), and Claude Code (had no working tools). The Copilot-only
extras it used to list (`codebase`, `problems`, `usages`, `vscodeAPI`, `microsoft.docs.mcp`,
etc.) are gone since the generic vocabulary has no equivalent; if any of those turn out
to matter in Copilot, the fix is to extend the generic vocabulary + every translator,
not to put Copilot names back in the source file. The body/system prompt was left as-is.

## Other known gaps

- **Personas removed 2026-11-15.** They only existed to reach Gemini (`~/.gemini/GEMINI.md`)
  and Copilot (repo-local `.github/copilot-instructions.md`) before those tools had
  native agents/skills; both now do (Gemini subagents above; `~/.agents/skills/` is an
  official alias read by Gemini CLI and Copilot CLI, verified 2026-11-15 against
  geminicli.com/docs/cli/skills and docs.github.com). The agent-level `persona:` field
  was never consumed by anything, and nothing read `~/.opencode/personas/`.

- (Resolved 2026-11-15) `expert-react-frontend-developer.md` used to carry VS Code-specific
  inline-array tool names and no `model`; see the normalization section above. The
  inline-array handling it motivated stays in the translators (OpenCode → explicit
  deny-all, fixed 2026-07-21; Gemini → skip) as fail-safes, covered by fixture tests.
- No project-local `.opencode/agents`/`.opencode/skills` symlink exists anymore (removed
  2026-07-21). It's unnecessary: OpenCode resolves the global `~/.opencode/agents/` copy
  (translated, permission-mapped) from any cwd, confirmed via `opencode agent list` run
  from outside this repo. The symlink also actively broke every `opencode` command run
  inside this repo, since it exposed the untranslated source `tools:` array directly,
  which fails OpenCode's schema.

## Testing

`npm test` runs the Vitest suite in `test/sync.test.ts`: fixture-based unit tests for
every `translateToolsFor*` function plus one integration test that runs the real
`main()` against real source content with every global target dir injected via
`main(options)` and pointed at a temp directory, so it never touches real config.
`npm run typecheck` runs `tsc`. CI (`.github/workflows/ci.yml`) runs both on every push.

## Future directions (added 2026-07-25)

Candidate next steps, roughly in priority order based on cost against benefit:

- **[ACTIVE PLANNING] Migrate to npm/TypeScript (added 2026-08-31, replanned 2026-09-09).**
  Goal: cross-platform tool, npm distribution, and exposure for the project. Decisions
  made 2026-09-09 after plan review:
  - Publish the **tool** to npm as `agent-registry` (name confirmed available on the
    registry 2026-09-09). Personal content is NOT published wholesale; selected
    agents/skills will be marked public and shared — marking + distribution mechanism
    is an open decision (see Phase 2).
  - **TypeScript**, erasable-syntax-only (no enums/namespaces/parameter properties):
    runs natively on Node ≥23.6 via type stripping, so no build step in dev; `tsc`
    emits `dist/` JS + `.d.ts` only at publish time. Vitest for tests.
  - Translators stay **line-based string transforms** (ported 1:1 from the awk) — NOT
    js-yaml parse/re-serialize, which would reformat frontmatter (key order, quoting,
    comments) and make byte-level parity checking impossible.
  - CI and the golden-diff parity test are part of Phase 1, not a later phase.

  **Phase 1: TypeScript port with proven parity — DONE 2026-09-09 except cutover wait**
  - [x] package.json devDeps (typescript, @types/node, vitest) + tsconfig (erasable-only)
  - [x] Port `scripts/sync.sh` → `src/sync.ts` (1:1; env-overridable target dirs kept,
        plus a `main(options)` API so tests inject dirs/logger directly)
  - [x] Port `scripts/sync.test.sh` → `test/sync.test.ts` (10 Vitest tests passing)
  - [x] Golden-diff parity test (`test/parity.test.ts`): both versions run against the
        same sources into two temp trees; `diff -r` confirmed **byte-identical** on
        first run, including the shared `.github/copilot-instructions.md` output
  - [x] GitHub Action (`.github/workflows/ci.yml`): typecheck + vitest (incl. parity)
        + legacy bash suite, Node 24, on push/PR
  - [x] Cutover: `npm run sync` now runs the TS version (`npm run sync:bash` keeps the
        old one available)
  - [x] Cutover completed 2026-11-15: `scripts/sync.sh`, `scripts/sync.test.sh`, the
        parity test, and the `sync:bash`/`test:bash` npm scripts deleted. Phase 1 closed.

  **Phase 2: packaging & publish**
  - Public/private mechanism DECIDED 2026-09-09: frontmatter `visibility: public` flag,
    **default-deny** (missing/misspelled field ⇒ private; only the exact value `public`
    exports). Public items are exported by a tool `export` command into the tool's
    public GitHub repo as a `registry/` starter set; this private repo stays the single
    source of truth. Guards: a test asserting nothing without `visibility: public` ever
    appears in export output; npm package uses a `files:` allowlist so content can't
    ship accidentally. Caveat to remember: demoting a once-public file doesn't scrub
    the public repo's git history — manual cleanup if that ever matters.
  - [ ] Implement `visibility:` filter + `export` command + default-deny leak test
  - [ ] Separate tool from content: `bin/` entry, `files:` allowlist in package.json
        (tool code only, never personal content), `prepublishOnly` build
  - [ ] Publish to npm; verify `npm install -g agent-registry` end-to-end
  - [ ] Exposure work: public repo README, GitHub topics, examples/demo — an npm
        listing alone brings near-zero discovery; the public GitHub repo is the
        exposure play
  - [ ] Install/setup guide for npm users vs. git-clone users

  **Phase 3: features (trimmed 2026-09-09)**
  - [ ] CLI flags via `util.parseArgs` (no dep): `--dry-run`, `--verbose`
  - [ ] Selective sync: `--platforms` filter + whitelist/blacklist
  - [ ] Config file support (`.agent-registryrc` or `agent-registry.config.ts`)
  - Cut as over-engineering for a <1s sync of ~20 files: inquirer wizard, progress
    bars, chalk (`util.styleText` covers color for free if wanted)

  (Former Phase 4 dissolved into separate Future directions bullets below, 2026-09-09.)

  **Research artifact:** Competitive analysis vs. agent-skills-sync-tool, opensite-skills, GitHub CLI
  (see: https://github.com/alexnesteruk/agent-registry/discussions/[TBD])

- **Package for external/team use.** Mostly overlaps with npm migration above. Requires
  generalizing away from hardcoded `$HOME`-relative assumptions and documenting for users
  with different target directory structures.

- **More sync targets** (Cursor, Windsurf, Zed, Cline, etc.). Gemini CLI subagents were
  added 2026-11-15 (see verification section above). Benefit is the core value
  proposition, one edit propagates everywhere, but cost compounds per target: every
  tool's real mechanism has been a surprise so far (OpenCode's `permission:` map,
  Copilot's `tools:` schema, Antigravity's still-unverified enforcement above), so each
  addition is its own research-and-verify cycle plus a translator plus test coverage,
  not a copy-paste.

- **Auto-sync on save** (git hook or file watcher instead of remembering to run
  `npm run sync`). Low cost, direct benefit: removes the one manual step that's already
  caused real drift (the stale `SandBox17/.opencode` copy existed because nothing
  forced a re-sync, see "Other known gaps" above).

- **CI validation** (run sync tests in a GitHub Action on push). Low cost since the
  test suite already exists. Catches a translator regression before it reaches the real
  `~/.claude`/`~/.opencode`/etc. targets, instead of only being caught by hand, which is
  how the OpenCode crash and the silent tools-dropping bug were both found.

- **Adopt the Agent Skills spec (https://agentskills.io).** (Split out of the former npm
  Phase 4, 2026-09-09.) Doubles as an exposure channel if the spec's ecosystem lists
  compatible tools.

- **`gh skill` compatibility.** (Split out of former Phase 4.) Existence CONFIRMED
  2026-11-15: GitHub's Copilot CLI docs (docs.github.com, create-skills page) reference
  `gh skill` for searching, installing, updating, and publishing agent skills. Exact
  subcommand syntax still unchecked — read `gh skill --help` before building against it.

- **Cloud platform sync (Playwright for Perplexity, Claude Desktop).** (Split out of
  former Phase 4.) A separate project with its own risk profile, not a sync-tool feature.

- **Version pinning + provenance metadata in package.json.** (Split out of former
  Phase 4.) Only meaningful once the npm package exists and has consumers.

- **Extend beyond agents/skills to MCP server configs.** There's already a real
  MCP entry wired into `~/.opencode/config.json` pointing at the sibling
  `agent-registry-mcp` repo. Folding that config into the same source-of-truth/sync
  pattern is a moderate lift but closes a real gap, that config isn't versioned or
  reproducible anywhere right now.
