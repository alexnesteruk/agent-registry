// Golden-diff parity test (TODO.md Phase 1): run the bash sync.sh and the
// TypeScript port against the same real sources into two separate temp target
// trees, then require the trees to be byte-identical (`diff -r`). This is the
// guard that makes the cutover safe; delete it together with scripts/sync.sh
// once the bash version is retired.

import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/sync.ts";

const REGISTRY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COPILOT_INSTRUCTIONS = path.join(REGISTRY_DIR, ".github", "copilot-instructions.md");

describe("bash/TypeScript parity", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-registry-parity-"));
  const bashTree = path.join(tmpRoot, "bash");
  const tsTree = path.join(tmpRoot, "ts");
  afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it("produces byte-identical output trees", () => {
    execFileSync("bash", [path.join(REGISTRY_DIR, "scripts", "sync.sh")], {
      env: {
        ...process.env,
        OPENCODE_DIR: path.join(bashTree, "opencode"),
        ANTIGRAVITY_DIR: path.join(bashTree, "agents"),
        CLAUDE_DIR: path.join(bashTree, "claude"),
        COPILOT_DIR: path.join(bashTree, "copilot"),
        GEMINI_DIR: path.join(bashTree, "gemini"),
      },
      stdio: "pipe",
    });
    // Both versions also write the project-local .github/copilot-instructions.md
    // to the same path; snapshot the bash result before the TS run overwrites it.
    const bashCopilotInstructions = fs.readFileSync(COPILOT_INSTRUCTIONS, "utf8");

    main({
      opencodeDir: path.join(tsTree, "opencode"),
      antigravityDir: path.join(tsTree, "agents"),
      claudeDir: path.join(tsTree, "claude"),
      copilotDir: path.join(tsTree, "copilot"),
      geminiDir: path.join(tsTree, "gemini"),
      log: () => {},
    });
    const tsCopilotInstructions = fs.readFileSync(COPILOT_INSTRUCTIONS, "utf8");

    expect(tsCopilotInstructions).toBe(bashCopilotInstructions);

    // diff -r exits non-zero (throws) on any difference; its output names the
    // first mismatching file, which vitest surfaces in the failure message.
    expect(() => execFileSync("diff", ["-r", bashTree, tsTree], { encoding: "utf8" })).not.toThrow();
  });
});
