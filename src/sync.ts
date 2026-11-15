// Syncs agent-registry to all supported AI CLI targets.
//
// TypeScript port of scripts/sync.sh (2026-09-09). Behavior is intentionally
// byte-identical to the bash version — verified by test/parity.test.ts, which
// runs both against the same sources and diffs the output trees. Keep it that
// way until the bash version is deleted (see TODO.md Phase 1 cutover).
//
// Global targets:
//   ~/.opencode/         OpenCode (agents get tools: → permission: translation)
//   ~/.agents/           Antigravity (agents copied untranslated — see TODO.md)
//   ~/.claude/           Claude Code (agents get tools: name translation)
//   ~/.copilot/agents/   GitHub Copilot custom agents (tools: name translation,
//                        .agent.md extension)
//   ~/.gemini/GEMINI.md  Gemini (personas only, compiled)
//
// All global target dirs are env-overridable (OPENCODE_DIR, ANTIGRAVITY_DIR,
// CLAUDE_DIR, COPILOT_DIR, GEMINI_DIR), defaulting to $HOME/.<tool>. This is
// what makes the sync testable without touching real global config: point them
// at a temp dir and run the whole thing for real.
//
// Project-local (this repo only):
//   .github/copilot-instructions.md  (personas only, compiled — GitHub Copilot's
//     repo-level instructions feature; separate from ~/.copilot/agents/ above)
//
// The translators are deliberately LINE-BASED string transforms, not YAML
// parse/re-serialize: parsing would reformat frontmatter (key order, quoting,
// comments) and make parity checking against the awk originals impossible.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REGISTRY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PERSONAS_DIR = path.join(REGISTRY_DIR, "personas");
const AGENTS_DIR = path.join(REGISTRY_DIR, "agents");
const SKILLS_DIR = path.join(REGISTRY_DIR, "skills");

export type Logger = (message: string) => void;

const defaultLog: Logger = (message) => {
  process.stdout.write(`\x1b[1;34m[sync-ai]\x1b[0m ${message}\n`);
};

// Mirrors awk record semantics: input is processed line by line, and output
// always ends with a trailing newline when non-empty (awk's ORS), even if the
// input file lacked one.
function transformLines(content: string, fn: (lines: string[]) => string[]): string {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out = fn(lines);
  return out.length ? out.join("\n") + "\n" : "";
}

export function stripFrontmatter(content: string): string {
  return transformLines(content, (lines) => {
    const out: string[] = [];
    let fm = false;
    lines.forEach((line, i) => {
      if (line === "---") {
        if (i === 0) {
          fm = true;
          return;
        } else if (fm) {
          fm = false;
          return;
        }
      }
      if (!fm) out.push(line);
    });
    return out;
  });
}

// agents/*.md are authored with a generic tool vocabulary (read_file, write_file,
// run_terminal_cmd, web_search). That vocabulary is not any CLI's real tool names —
// it must be translated per target or the agent silently gets no working tools
// (confirmed: a Claude Code subagent with untranslated `tools: [write_file]` had
// zero real write access and hallucinated fake tool-call output instead of erroring).
// Names with no entry pass through unchanged (e.g. expert-react-frontend-developer.md
// already uses VS Code/Copilot-specific names, not this generic vocabulary).
function translateBlockListTools(content: string, map: Record<string, string>): string {
  return transformLines(content, (lines) => {
    const out: string[] = [];
    let inFm = false;
    let inTools = false;
    for (const line of lines) {
      if (line === "---") {
        inFm = !inFm;
        out.push(line);
        continue;
      }
      if (inFm && line.startsWith("tools:")) {
        inTools = true;
        out.push(line);
        continue;
      }
      if (inFm && inTools && line.startsWith("  - ")) {
        const name = line.slice(4);
        out.push(name in map ? `  - ${map[name]}` : line);
        continue;
      }
      if (inFm && inTools) inTools = false;
      out.push(line);
    }
    return out;
  });
}

export function translateToolsForClaude(content: string): string {
  return translateBlockListTools(content, {
    read_file: "Read",
    write_file: "Write",
    run_terminal_cmd: "Bash",
    web_search: "WebSearch",
  });
}

// GitHub Copilot's real mechanism (confirmed via code.visualstudio.com/docs/agent-customization/custom-agents,
// 2026-07-21) is .agent.md files with a tools: list of its own built-in names.
// This mapping is a best-effort guess from VS Code docs, not empirically
// confirmed the way Claude's is; web_search → fetch is the weakest link
// (fetch retrieves a URL, it doesn't search). See TODO.md.
export function translateToolsForCopilot(content: string): string {
  return translateBlockListTools(content, {
    read_file: "readFile",
    write_file: "editFiles",
    run_terminal_cmd: "runInTerminal",
    web_search: "fetch",
  });
}

// OpenCode's real mechanism (confirmed via opencode.ai/docs/agents) is a
// `permission:` map (allow/ask/deny), not a `tools:` list, so the generic
// vocabulary's `tools:` key is unrecognized schema and must be translated.
//
// An inline `tools: [...]` array (expert-react-frontend-developer.md's
// VS Code-specific names) has no real OpenCode equivalent, so it becomes an
// explicit deny-all: fail safe (no access) rather than fail open (default
// access, the silent-drop bug this replaced — see sync.sh history).
export function translateToolsForOpencode(content: string): string {
  const map: Record<string, string> = {
    read_file: "read",
    write_file: "edit",
    run_terminal_cmd: "bash",
    web_search: "websearch",
  };
  return transformLines(content, (lines) => {
    const out: string[] = [];
    let inFm = false;
    let inTools = false;
    let hasSkills = false;
    let inlineTools = false;
    const perms: string[] = [];
    for (const line of lines) {
      if (line === "---") {
        if (!inFm) {
          inFm = true;
          out.push(line);
          continue;
        }
        if (perms.length > 0 || hasSkills || inlineTools) {
          out.push("permission:");
          for (const p of perms) out.push(`  ${p}: allow`);
          if (hasSkills) out.push("  skill: allow");
          if (inlineTools) {
            out.push("  read: deny");
            out.push("  edit: deny");
            out.push("  bash: deny");
            out.push("  webfetch: deny");
            out.push("  websearch: deny");
          }
        }
        inFm = false;
        out.push(line);
        continue;
      }
      if (inFm && line.startsWith("tools:")) {
        if (line.includes("[")) inlineTools = true;
        else inTools = true;
        continue;
      }
      if (inFm && inTools && line.startsWith("  - ")) {
        const name = line.slice(4);
        if (name in map) perms.push(map[name]!);
        continue;
      }
      if (inFm && inTools) inTools = false;
      if (inFm && line.startsWith("skills:")) {
        hasSkills = true;
        out.push(line);
        continue;
      }
      out.push(line);
    }
    return out;
  });
}

// ── sync ──────────────────────────────────────────────────────────────────────

function mdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && fs.statSync(path.join(dir, f)).isFile())
    .sort();
}

export interface SyncOptions {
  opencodeDir?: string;
  antigravityDir?: string;
  claudeDir?: string;
  copilotDir?: string;
  geminiDir?: string;
  log?: Logger;
}

export function main(options: SyncOptions = {}): void {
  const home = os.homedir();
  const opencodeDir = options.opencodeDir ?? process.env["OPENCODE_DIR"] ?? path.join(home, ".opencode");
  const antigravityDir = options.antigravityDir ?? process.env["ANTIGRAVITY_DIR"] ?? path.join(home, ".agents");
  const claudeDir = options.claudeDir ?? process.env["CLAUDE_DIR"] ?? path.join(home, ".claude");
  const copilotDir = options.copilotDir ?? process.env["COPILOT_DIR"] ?? path.join(home, ".copilot");
  const geminiDir = options.geminiDir ?? process.env["GEMINI_DIR"] ?? path.join(home, ".gemini");
  const log = options.log ?? defaultLog;

  const syncDir = (src: string, dest: string, label: string): void => {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const f of mdFiles(src)) {
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
      log(`  → ${path.join(dest, f)}`);
      count++;
    }
    log(`Synced ${count} ${label} → ${dest}`);
  };

  const translateAgents = (
    dest: string,
    translate: (content: string) => string,
    destName: (base: string) => string,
    doneMessage: (count: number) => string,
  ): void => {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const f of mdFiles(AGENTS_DIR)) {
      const outPath = path.join(dest, destName(path.basename(f, ".md")));
      fs.writeFileSync(outPath, translate(fs.readFileSync(path.join(AGENTS_DIR, f), "utf8")));
      log(`  → ${outPath} (tools translated)`);
      count++;
    }
    log(doneMessage(count));
  };

  // Header string says sync.sh for byte-parity with the bash version; update it
  // (and the parity test) together when the bash version is deleted.
  const compilePersonas = (outFile: string): void => {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let out = "<!-- AUTO-GENERATED by sync.sh — edit files in personas/ -->\n\n";
    for (const f of mdFiles(PERSONAS_DIR)) {
      out += stripFrontmatter(fs.readFileSync(path.join(PERSONAS_DIR, f), "utf8")) + "\n";
    }
    fs.writeFileSync(outFile, out);
  };

  // ── OpenCode (global) ──────────────────────────────────────────────────────

  syncDir(PERSONAS_DIR, path.join(opencodeDir, "personas"), "persona(s)");

  translateAgents(
    path.join(opencodeDir, "agents"),
    translateToolsForOpencode,
    (base) => `${base}.md`,
    (n) => `Synced ${n} agent(s) → ${path.join(opencodeDir, "agents")}/ (tools translated to OpenCode permission: map)`,
  );

  syncDir(SKILLS_DIR, path.join(opencodeDir, "skills"), "skill(s)");

  // ── Antigravity (global) ───────────────────────────────────────────────────
  //
  // Agents ARE read from here (confirmed empirically), but whether the tools:
  // field inside agent.md does anything is unverified — see TODO.md. Left
  // untranslated (plain copy) until confirmed, rather than guessing.

  let count = 0;
  for (const f of mdFiles(AGENTS_DIR)) {
    const dest = path.join(antigravityDir, "agents", path.basename(f, ".md"));
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(path.join(AGENTS_DIR, f), path.join(dest, "agent.md"));
    log(`  → ${path.join(dest, "agent.md")}`);
    count++;
  }
  log(`Synced ${count} agent(s) → ${path.join(antigravityDir, "agents")}/`);

  count = 0;
  for (const f of mdFiles(SKILLS_DIR)) {
    const dest = path.join(antigravityDir, "skills", path.basename(f, ".md"));
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(path.join(SKILLS_DIR, f), path.join(dest, "SKILL.md"));
    log(`  → ${path.join(dest, "SKILL.md")}`);
    count++;
  }
  log(`Synced ${count} skill(s) → ${path.join(antigravityDir, "skills")}/`);

  // ── Claude Code (global) ───────────────────────────────────────────────────

  translateAgents(
    path.join(claudeDir, "agents"),
    translateToolsForClaude,
    (base) => `${base}.md`,
    (n) => `Synced ${n} agent(s) → ${path.join(claudeDir, "agents")}/ (tools translated to Claude Code names)`,
  );

  syncDir(SKILLS_DIR, path.join(claudeDir, "commands"), "skill(s) as commands");

  // ── GitHub Copilot custom agents (global) ──────────────────────────────────
  //
  // User-profile scope (~/.copilot/agents/), not workspace (.github/agents/),
  // matching this project's "agents are global, not per-repo" decision.
  // Extension is .agent.md (VS Code/JetBrains custom-agent format).

  translateAgents(
    path.join(copilotDir, "agents"),
    translateToolsForCopilot,
    (base) => `${base}.agent.md`,
    (n) => `Synced ${n} agent(s) → ${path.join(copilotDir, "agents")}/ (tools translated to Copilot names, .agent.md)`,
  );

  // ── GitHub Copilot — personas only (project-local) ─────────────────────────

  const copilotFile = path.join(REGISTRY_DIR, ".github", "copilot-instructions.md");
  compilePersonas(copilotFile);
  log(`Compiled personas → ${copilotFile}`);

  // ── Gemini — personas only ─────────────────────────────────────────────────

  const geminiFile = path.join(geminiDir, "GEMINI.md");
  compilePersonas(geminiFile);
  log(`Compiled personas → ${geminiFile}`);

  log("Done.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
