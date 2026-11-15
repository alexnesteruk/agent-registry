// Syncs agent-registry to all supported AI CLI targets.
//
// Global targets:
//   ~/.opencode/         OpenCode (agents get tools: → permission: translation; skills)
//   ~/.agents/           Antigravity (agents copied untranslated — see TODO.md; skills).
//                        ~/.agents/skills/ is ALSO read by Gemini CLI and Copilot CLI
//                        as an official alias for their own skills dirs (verified
//                        2026-11-15 against geminicli.com and docs.github.com), so one
//                        write reaches all three.
//   ~/.claude/           Claude Code (agents get tools: name translation; skills as commands)
//   ~/.copilot/agents/   GitHub Copilot custom agents (tools: name translation, .agent.md)
//   ~/.gemini/agents/    Gemini CLI custom subagents (tools: name translation; model:
//                        and persona: dropped — see translateToolsForGemini)
//
// All global target dirs are env-overridable (OPENCODE_DIR, ANTIGRAVITY_DIR,
// CLAUDE_DIR, COPILOT_DIR, GEMINI_DIR), defaulting to $HOME/.<tool>, and
// injectable via main(options). This is what makes the sync testable without
// touching real global config: point them at a temp dir and run the whole thing.
//
// Personas were removed 2026-11-15: they only existed to reach Gemini (GEMINI.md)
// and Copilot (repo-local copilot-instructions.md) before those tools had native
// agents/skills. Both now do, and the agent-level `persona:` field was never wired
// into anything.
//
// The translators are deliberately LINE-BASED string transforms, not YAML
// parse/re-serialize: parsing would reformat frontmatter (key order, quoting,
// comments) in every synced file.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REGISTRY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const AGENTS_DIR = path.join(REGISTRY_DIR, "agents");
const SKILLS_DIR = path.join(REGISTRY_DIR, "skills");

export type Logger = (message: string) => void;

const defaultLog: Logger = (message) => {
  process.stdout.write(`\x1b[1;34m[sync-ai]\x1b[0m ${message}\n`);
};

// Input is processed line by line; output always ends with a trailing newline
// when non-empty, even if the input file lacked one.
function transformLines(content: string, fn: (lines: string[]) => string[]): string {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out = fn(lines);
  return out.length ? out.join("\n") + "\n" : "";
}

// agents/*.md are authored with a generic tool vocabulary (read_file, write_file,
// run_terminal_cmd, web_search). That vocabulary is not any CLI's real tool names —
// it must be translated per target or the agent silently gets no working tools
// (confirmed: a Claude Code subagent with untranslated `tools: [write_file]` had
// zero real write access and hallucinated fake tool-call output instead of erroring).
// Names with no entry pass through unchanged (e.g. expert-react-frontend-developer.md
// already uses VS Code/Copilot-specific names, not this generic vocabulary).
//
// `dropKeys` removes whole frontmatter entries (the key line plus any indented
// continuation lines) for targets that would reject or misread them.
function translateBlockListTools(
  content: string,
  map: Record<string, string>,
  dropKeys: readonly string[] = [],
): string {
  return transformLines(content, (lines) => {
    const out: string[] = [];
    let inFm = false;
    let inTools = false;
    let dropping = false;
    for (const line of lines) {
      if (line === "---") {
        inFm = !inFm;
        dropping = false;
        out.push(line);
        continue;
      }
      if (inFm && dropping && (line.startsWith("  ") || line === "")) continue;
      dropping = false;
      if (inFm && dropKeys.some((k) => line.startsWith(`${k}:`))) {
        dropping = true;
        inTools = false;
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

// Gemini CLI custom subagents (geminicli.com/docs/core/subagents): ~/.gemini/agents/*.md
// with YAML frontmatter. `tools:` is a list of Gemini's built-in tool names and
// DOES restrict the agent (omitted = inherits all). Names confirmed against the
// docs and the installed gemini-cli 0.46.0 bundle.
//
// Verified empirically 2026-11-15 via `gemini skills list`, whose agent loader
// prints validation errors: Gemini's schema is STRICT. Unknown keys are rejected
// ("Unrecognized key(s) in object: 'skills'"), every tool name is validated
// ("tools.N: Invalid tool name"), and `name` must be a slug. Hence:
//   - `model:` dropped (our values are Claude ids; Gemini defaults to `inherit`)
//   - `persona:`/`skills:` dropped (registry-only keys; Gemini rejects the file)
//   - an inline `tools: [...]` array (expert-react-frontend-developer.md's VS Code
//     names, plus its non-slug name) is SKIPPED for Gemini rather than written
//     with `tools:` removed, because a missing `tools:` inherits every tool —
//     the fail-open outcome this translation layer exists to prevent.
export function translateToolsForGemini(content: string): string | null {
  if (hasInlineToolsArray(content)) return null;
  return translateBlockListTools(
    content,
    {
      read_file: "read_file",
      write_file: "write_file",
      run_terminal_cmd: "run_shell_command",
      web_search: "google_web_search",
    },
    ["model", "persona", "skills"],
  );
}

function hasInlineToolsArray(content: string): boolean {
  let inFm = false;
  for (const line of content.split("\n")) {
    if (line === "---") {
      if (inFm) return false;
      inFm = true;
      continue;
    }
    if (inFm && line.startsWith("tools:") && line.includes("[")) return true;
  }
  return false;
}

// OpenCode's real mechanism (confirmed via opencode.ai/docs/agents) is a
// `permission:` map (allow/ask/deny), not a `tools:` list, so the generic
// vocabulary's `tools:` key is unrecognized schema and must be translated.
//
// An inline `tools: [...]` array (expert-react-frontend-developer.md's
// VS Code-specific names) has no real OpenCode equivalent, so it becomes an
// explicit deny-all: fail safe (no access) rather than fail open (default
// access, the silent-drop bug this replaced).
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

  // A translator returns null when the agent can't be represented safely for
  // that target (see translateToolsForGemini); the agent is then skipped, not
  // written in a fail-open form.
  const translateAgents = (
    dest: string,
    translate: (content: string) => string | null,
    destName: (base: string) => string,
    doneMessage: (count: number) => string,
  ): void => {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const f of mdFiles(AGENTS_DIR)) {
      const translated = translate(fs.readFileSync(path.join(AGENTS_DIR, f), "utf8"));
      if (translated === null) {
        log(`  ✗ ${f} skipped: not representable for this target (see translator comment in src/sync.ts)`);
        continue;
      }
      const outPath = path.join(dest, destName(path.basename(f, ".md")));
      fs.writeFileSync(outPath, translated);
      log(`  → ${outPath} (tools translated)`);
      count++;
    }
    log(doneMessage(count));
  };

  // ── OpenCode (global) ──────────────────────────────────────────────────────

  translateAgents(
    path.join(opencodeDir, "agents"),
    translateToolsForOpencode,
    (base) => `${base}.md`,
    (n) => `Synced ${n} agent(s) → ${path.join(opencodeDir, "agents")}/ (tools translated to OpenCode permission: map)`,
  );

  syncDir(SKILLS_DIR, path.join(opencodeDir, "skills"), "skill(s)");

  // ── Antigravity (global) — skills dir doubles as the Gemini/Copilot alias ──
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
  log(`Synced ${count} skill(s) → ${path.join(antigravityDir, "skills")}/ (also read by Gemini CLI + Copilot CLI)`);

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

  // ── Gemini CLI custom subagents (global) ───────────────────────────────────

  translateAgents(
    path.join(geminiDir, "agents"),
    translateToolsForGemini,
    (base) => `${base}.md`,
    (n) => `Synced ${n} agent(s) → ${path.join(geminiDir, "agents")}/ (tools translated to Gemini names; model:/persona:/skills: dropped)`,
  );

  log("Done.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
