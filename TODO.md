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

Separately, `~/.copilot/agents/expert-react-frontend-developer.agent.md` (passed through untranslated, since its `tools:` already uses Copilot-style names) contains `"edit/editFiles"`. This exact [...]

**How to verify:** open a synced agent (e.g. `angular-developer`) in Copilot Chat in WebStorm or VS Code, check the Tools icon to see which of its listed tools actually resolve vs. show as unrecog[...]

## Other known gaps

- `expert-react-frontend-developer.md` uses VS Code/Copilot-specific tool names in its
  `tools:` field (not this library's generic vocabulary), and lacks `persona`/`model`
  fields other agents have. For OpenCode, `translateToolsForOpencode` now translates
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

`npm test` runs the Vitest suite in `test/`: `sync.test.ts` covers the translateToolsFor* /
stripFrontmatter functions (fixture-based unit tests) plus one integration test that runs
the real `main()` against real source content with every global target dir injected via
`main(options)` and pointed at a temp directory; `parity.test.ts` runs the legacy bash
`sync.sh` and `src/sync.ts` against the same sources and requires byte-identical output
trees (`diff -r`). `npm run typecheck` runs `tsc`. CI (`.github/workflows/ci.yml`) runs
both plus the legacy suite on every push.

Legacy: `bash scripts/sync.test.sh` (or `npm run test:bash`) is the original bash suite,
kept until the bash version is deleted at cutover (see Phase 1 below). `sync.sh` is
sourceable without side effects (`main()` only runs when executed directly) specifically
so that works.

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
  - [ ] After ~a week of real `npm run sync` use (from 2026-09-09): delete
        `scripts/sync.sh` + `scripts/sync.test.sh` + the parity test + `sync:bash`/
        `test:bash` scripts, and update the "AUTO-GENERATED by sync.sh" header string
        in `src/sync.ts` (kept verbatim for byte-parity) to say sync.ts

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

- **More sync targets** (Cursor, Windsurf, Zed, Cline, etc.). Benefit is the core value
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

- **`gh skill list/install` compatibility.** (Split out of former Phase 4.) VERIFY the
  command actually exists as described before planning against it — every external
  mechanism assumed so far (OpenCode `permission:`, Copilot `tools:`, Antigravity)
  turned out to be a surprise.

- **Cloud platform sync (Playwright for Perplexity, Claude Desktop).** (Split out of
  former Phase 4.) A separate project with its own risk profile, not a sync-tool feature.

- **Version pinning + provenance metadata in package.json.** (Split out of former
  Phase 4.) Only meaningful once the npm package exists and has consumers.

- **Extend beyond agents/skills/personas to MCP server configs.** There's already a real
  MCP entry wired into `~/.opencode/config.json` pointing at the sibling
  `agent-registry-mcp` repo. Folding that config into the same source-of-truth/sync
  pattern is a moderate lift but closes a real gap, that config isn't versioned or
  reproducible anywhere right now.
