// Two layers:
//   1. Unit tests for the pure translate* functions against small fixtures
//      (not the real agents/*.md).
//   2. One integration test running the real main() against the real source
//      content with every global target dir redirected to a temp directory,
//      so it never touches your actual ~/.claude, ~/.opencode, etc.

import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  main,
  translateToolsForClaude,
  translateToolsForCopilot,
  translateToolsForGemini,
  translateToolsForOpencode,
} from "../src/sync.ts";

const BLOCK_LIST_FIXTURE = `---
name: fixture-agent
description: a fixture
tools:
  - read_file
  - write_file
  - run_terminal_cmd
  - web_search
skills:
  - explain-code
---

# Fixture Agent

Body text here.
`;

// Mirrors the real agents: model: is a Claude id, persona: sits between
// description: and model:, and the body contains a `model:`-looking line
// that must NOT be touched (drops are frontmatter-only).
const FULL_FRONTMATTER_FIXTURE = `---
name: full-fixture
description: has every field the registry uses
persona: senior-engineer
model: claude-sonnet-5
tools:
  - read_file
  - run_terminal_cmd
skills:
  - explain-code
---

Body. Mentions model: in prose, which stays.
`;

const INLINE_ARRAY_FIXTURE = `---
name: inline-fixture
description: uses inline array tools, like expert-react-frontend-developer.md
tools: ["codebase", "editFiles", "runInTerminal"]
---

Body.
`;

const NO_TOOLS_FIXTURE = `---
name: no-tools-fixture
description: has no tools or skills at all
---

Body.
`;

describe("translateToolsForClaude", () => {
  it("maps the generic vocabulary to Claude Code tool names", () => {
    const out = translateToolsForClaude(BLOCK_LIST_FIXTURE);
    expect(out).toContain("  - Read");
    expect(out).toContain("  - Write");
    expect(out).toContain("  - Bash");
    expect(out).toContain("  - WebSearch");
    expect(out).not.toContain("read_file");
  });

  it("keeps model: and persona: (Claude Code tolerates them)", () => {
    const out = translateToolsForClaude(FULL_FRONTMATTER_FIXTURE);
    expect(out).toContain("model: claude-sonnet-5");
    expect(out).toContain("persona: senior-engineer");
  });

  it("passes inline-array tools through untouched (no block-list match)", () => {
    const out = translateToolsForClaude(INLINE_ARRAY_FIXTURE);
    expect(out).toContain('tools: ["codebase", "editFiles", "runInTerminal"]');
  });
});

describe("translateToolsForOpencode", () => {
  it("replaces tools: with a permission: map and honors skills:", () => {
    const out = translateToolsForOpencode(BLOCK_LIST_FIXTURE);
    expect(out).toContain("permission:");
    expect(out).not.toContain("tools:");
    expect(out).toContain("  read: allow");
    expect(out).toContain("  edit: allow");
    expect(out).toContain("  bash: allow");
    expect(out).toContain("  websearch: allow");
    expect(out).toContain("  skill: allow");
  });

  it("adds no permission: block when there are no tools or skills", () => {
    const out = translateToolsForOpencode(NO_TOOLS_FIXTURE);
    expect(out).not.toContain("permission:");
  });

  // Inline-array tools: (as used by expert-react-frontend-developer.md) have no
  // real OpenCode equivalent, so they're translated to an explicit deny-all
  // rather than silently dropped (which previously granted default/broad access
  // instead of the intended restriction, a real bug the original test caught).
  it("translates inline-array tools to an explicit deny-all", () => {
    const out = translateToolsForOpencode(INLINE_ARRAY_FIXTURE);
    expect(out).not.toContain("tools:");
    expect(out).toContain("  read: deny");
    expect(out).toContain("  edit: deny");
    expect(out).toContain("  bash: deny");
    expect(out).toContain("  webfetch: deny");
    expect(out).toContain("  websearch: deny");
  });
});

describe("translateToolsForCopilot", () => {
  it("maps the generic vocabulary to Copilot tool names", () => {
    const out = translateToolsForCopilot(BLOCK_LIST_FIXTURE);
    expect(out).toContain("  - readFile");
    expect(out).toContain("  - editFiles");
    expect(out).toContain("  - runInTerminal");
    expect(out).toContain("  - fetch");
    expect(out).not.toContain("read_file");
  });

  it("passes inline-array tools through untouched", () => {
    const out = translateToolsForCopilot(INLINE_ARRAY_FIXTURE);
    expect(out).toContain('tools: ["codebase", "editFiles", "runInTerminal"]');
  });
});

describe("translateToolsForGemini", () => {
  it("maps the generic vocabulary to Gemini CLI tool names", () => {
    const out = translateToolsForGemini(BLOCK_LIST_FIXTURE);
    expect(out).toContain("  - read_file");
    expect(out).toContain("  - write_file");
    expect(out).toContain("  - run_shell_command");
    expect(out).toContain("  - google_web_search");
    expect(out).not.toContain("run_terminal_cmd");
    expect(out).not.toMatch(/^  - web_search$/m);
  });

  // Gemini's loader rejects unknown keys outright (verified 2026-11-15:
  // "Unrecognized key(s) in object: 'skills'"), so all registry-only keys go.
  it("drops model:, persona:, and skills: from frontmatter only", () => {
    const out = translateToolsForGemini(FULL_FRONTMATTER_FIXTURE)!;
    expect(out).not.toMatch(/^model:/m);
    expect(out).not.toMatch(/^persona:/m);
    expect(out).not.toMatch(/^skills:/m);
    expect(out).not.toContain("  - explain-code");
    expect(out).toContain("name: full-fixture");
    expect(out).toContain("  - run_shell_command");
    expect(out).toContain("Body. Mentions model: in prose, which stays.");
  });

  // Gemini validates every tool name, so VS Code names can't be written, and
  // omitting tools: would inherit ALL tools (fail-open). Skip instead.
  it("returns null (skip) for inline-array tools", () => {
    expect(translateToolsForGemini(INLINE_ARRAY_FIXTURE)).toBeNull();
  });
});

describe("integration: full main() run against real source content", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-registry-sync-"));
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it("syncs every target into redirected temp dirs", () => {
    main({
      opencodeDir: path.join(tmpRoot, "opencode"),
      antigravityDir: path.join(tmpRoot, "agents"),
      claudeDir: path.join(tmpRoot, "claude"),
      copilotDir: path.join(tmpRoot, "copilot"),
      geminiDir: path.join(tmpRoot, "gemini"),
      log: () => {},
    });

    const expectFile = (p: string) => expect(fs.existsSync(path.join(tmpRoot, p)), p).toBe(true);
    expectFile("opencode/agents/angular-developer.md");
    expectFile("opencode/skills/explain-code.md");
    expectFile("agents/agents/angular-developer/agent.md");
    expectFile("agents/skills/explain-code/SKILL.md");
    expectFile("claude/agents/angular-developer.md");
    expectFile("claude/commands/explain-code.md");
    expectFile("copilot/agents/angular-developer.agent.md");
    expectFile("gemini/agents/angular-developer.md");

    // Personas were removed 2026-11-15; nothing should produce these anymore.
    expect(fs.existsSync(path.join(tmpRoot, "opencode/personas"))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, "gemini/GEMINI.md"))).toBe(false);

    const read = (p: string) => fs.readFileSync(path.join(tmpRoot, p), "utf8");
    expect(read("claude/agents/angular-developer.md")).toContain("  - Read");
    expect(read("copilot/agents/angular-developer.agent.md")).toContain("  - readFile");
    expect(read("opencode/agents/angular-developer.md")).toContain("permission:");
    const gemini = read("gemini/agents/angular-developer.md");
    expect(gemini).toContain("  - run_shell_command");
    expect(gemini).not.toMatch(/^model:/m);
    expect(gemini).not.toMatch(/^persona:/m);
    expect(gemini).not.toMatch(/^skills:/m);
    // All 9 agents use the generic vocabulary since 2026-11-15, so none is skipped.
    expect(fs.readdirSync(path.join(tmpRoot, "gemini/agents"))).toHaveLength(
      fs.readdirSync(path.join(tmpRoot, "claude/agents")).length,
    );
    expect(read("gemini/agents/expert-react-frontend-developer.md")).toContain("name: expert-react-frontend-developer");
  });
});
