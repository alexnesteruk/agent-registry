// Port of scripts/sync.test.sh (2026-09-09). Same two layers:
//   1. Unit tests for the pure translate*/stripFrontmatter functions against
//      small fixtures (not the real agents/*.md).
//   2. One integration test running the real main() against the real source
//      content with every global target dir redirected to a temp directory,
//      so it never touches your actual ~/.claude, ~/.opencode, etc.

import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  main,
  stripFrontmatter,
  translateToolsForClaude,
  translateToolsForCopilot,
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

describe("stripFrontmatter", () => {
  it("drops the frontmatter block and keeps the body", () => {
    const out = stripFrontmatter(BLOCK_LIST_FIXTURE);
    expect(out).not.toContain("name: fixture-agent");
    expect(out).toContain("Body text here.");
  });
});

describe("translateToolsForClaude", () => {
  it("maps the generic vocabulary to Claude Code tool names", () => {
    const out = translateToolsForClaude(BLOCK_LIST_FIXTURE);
    expect(out).toContain("  - Read");
    expect(out).toContain("  - Write");
    expect(out).toContain("  - Bash");
    expect(out).toContain("  - WebSearch");
    expect(out).not.toContain("read_file");
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
  // instead of the intended restriction, a real bug the bash test caught).
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
    expectFile("opencode/personas/senior-engineer.md");
    expectFile("opencode/skills/explain-code.md");
    expectFile("agents/agents/angular-developer/agent.md");
    expectFile("agents/skills/explain-code/SKILL.md");
    expectFile("claude/agents/angular-developer.md");
    expectFile("claude/commands/explain-code.md");
    expectFile("copilot/agents/angular-developer.agent.md");
    expectFile("gemini/GEMINI.md");

    expect(fs.readFileSync(path.join(tmpRoot, "claude/agents/angular-developer.md"), "utf8")).toContain("  - Read");
    expect(fs.readFileSync(path.join(tmpRoot, "copilot/agents/angular-developer.agent.md"), "utf8")).toContain(
      "  - readFile",
    );
    expect(fs.readFileSync(path.join(tmpRoot, "opencode/agents/angular-developer.md"), "utf8")).toContain(
      "permission:",
    );
  });
});
