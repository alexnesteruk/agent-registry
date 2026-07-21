#!/usr/bin/env bash
# Syncs shared-ai-library to all supported AI CLI targets.
#
# Global targets:
#   ~/.opencode/         OpenCode (agents get tools: → permission: translation)
#   ~/.agents/skills     Antigravity (agents NOT synced — see TODO.md)
#   ~/.claude/           Claude Code (agents get tools: name translation)
#   ~/.gemini/GEMINI.md  Gemini (personas only, compiled)
#
# Project-local (this repo only):
#   .opencode/agents → ../agents  (symlink, created once)
#   .opencode/skills → ../skills  (symlink, created once)
#     ^ IDE Copilot extensions that read .opencode/ directly pick up raw
#       skill files here — not just the compiled instructions below.
#   .github/copilot-instructions.md  (personas only, compiled — this is
#     what GitHub Copilot's repo-level instructions feature reads; it does
#     NOT cover IDE Copilot's own .opencode/ integration, if configured)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PERSONAS_DIR="$REGISTRY_DIR/personas"
AGENTS_DIR="$REGISTRY_DIR/agents"
SKILLS_DIR="$REGISTRY_DIR/skills"

OPENCODE_DIR="${OPENCODE_DIR:-$HOME/.opencode}"
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-$HOME/.agents}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

# ── helpers ───────────────────────────────────────────────────────────────────

log() { printf '\033[1;34m[sync-ai]\033[0m %s\n' "$*"; }

strip_frontmatter() {
  awk 'BEGIN{fm=0} /^---$/{if(NR==1){fm=1;next}else if(fm){fm=0;next}} !fm' "$1"
}

# agents/*.md are authored with a generic tool vocabulary (read_file, write_file,
# run_terminal_cmd, web_search). That vocabulary is not any CLI's real tool names —
# it must be translated per target or the agent silently gets no working tools
# (confirmed: a Claude Code subagent with untranslated `tools: [write_file]` had
# zero real write access and hallucinated fake tool-call output instead of erroring).
# Only Claude Code's mapping is verified below; names with no entry pass through
# unchanged (e.g. expert-react-frontend-developer.md already uses VS Code/Copilot-
# specific names, which aren't part of this generic vocabulary at all).
translate_tools_for_claude() {
  awk '
    BEGIN {
      map["read_file"]="Read"
      map["write_file"]="Write"
      map["run_terminal_cmd"]="Bash"
      map["web_search"]="WebSearch"
      in_fm=0; in_tools=0
    }
    /^---$/ { in_fm = !in_fm; print; next }
    in_fm && /^tools:/ { in_tools=1; print; next }
    in_fm && in_tools && /^  - / {
      name=$0
      sub(/^  - /, "", name)
      if (name in map) print "  - " map[name]
      else print
      next
    }
    in_fm && in_tools { in_tools=0 }
    { print }
  ' "$1"
}

# OpenCode's real mechanism (confirmed via opencode.ai/docs/agents) is a
# `permission:` map (allow/ask/deny), not a `tools:` list — the generic
# vocabulary's `tools:` key is unrecognized schema and silently ignored,
# so agents synced without translation fall back to default (likely full)
# access rather than the intended restricted set.
translate_tools_for_opencode() {
  awk '
    BEGIN {
      map["read_file"]="read"
      map["write_file"]="edit"
      map["run_terminal_cmd"]="bash"
      map["web_search"]="websearch"
      in_fm=0; in_tools=0; has_skills=0; n=0
    }
    /^---$/ {
      if (in_fm == 0) { in_fm=1; print; next }
      if (n > 0 || has_skills) {
        print "permission:"
        for (i=1; i<=n; i++) print "  " perm[i] ": allow"
        if (has_skills) print "  skill: allow"
      }
      in_fm=0
      print
      next
    }
    in_fm && /^tools:/ { in_tools=1; next }
    in_fm && in_tools && /^  - / {
      name=$0
      sub(/^  - /, "", name)
      if (name in map) { n++; perm[n]=map[name] }
      next
    }
    in_fm && in_tools { in_tools=0 }
    in_fm && /^skills:/ { has_skills=1; print; next }
    { print }
  ' "$1"
}

sync_dir() {
  local src="$1" dest="$2" label="$3"
  mkdir -p "$dest"
  local count=0
  for f in "$src"/*.md; do
    [[ -f "$f" ]] || continue
    cp "$f" "$dest/$(basename "$f")"
    log "  → $dest/$(basename "$f")"
    ((count++))
  done
  log "Synced $count $label → $dest"
}

# ── .opencode symlinks (project-local, idempotent) ────────────────────────────

PROJECT_OPENCODE="$REGISTRY_DIR/.opencode"
mkdir -p "$PROJECT_OPENCODE"

if [[ ! -L "$PROJECT_OPENCODE/agents" ]]; then
  ln -s ../agents "$PROJECT_OPENCODE/agents"
  log "Created symlink → .opencode/agents"
fi
if [[ ! -L "$PROJECT_OPENCODE/skills" ]]; then
  ln -s ../skills "$PROJECT_OPENCODE/skills"
  log "Created symlink → .opencode/skills"
fi

# ── OpenCode (global) ─────────────────────────────────────────────────────────

sync_dir "$PERSONAS_DIR" "$OPENCODE_DIR/personas" "persona(s)"

mkdir -p "$OPENCODE_DIR/agents"
count=0
for f in "$AGENTS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  translate_tools_for_opencode "$f" > "$OPENCODE_DIR/agents/$(basename "$f")"
  log "  → $OPENCODE_DIR/agents/$(basename "$f") (tools translated)"
  ((count++))
done
log "Synced $count agent(s) → $OPENCODE_DIR/agents/ (tools translated to OpenCode permission: map)"

sync_dir "$SKILLS_DIR"   "$OPENCODE_DIR/skills"   "skill(s)"

# ── Antigravity (global) ──────────────────────────────────────────────────────
#
# Agents ARE read from here — confirmed empirically (user sees them surface
# in the Antigravity app), contradicting the bundled docs' customization-type
# list. What's still unverified is whether the `tools:` field inside agent.md
# does anything there, and if so what its real vocabulary is — see TODO.md.
# Left untranslated (plain copy) until that's confirmed, rather than guessing.

count=0
for f in "$AGENTS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  agent_name="$(basename "$f" .md)"
  dest="$ANTIGRAVITY_DIR/agents/$agent_name"
  mkdir -p "$dest"
  cp "$f" "$dest/agent.md"
  log "  → $dest/agent.md"
  ((count++))
done
log "Synced $count agent(s) → $ANTIGRAVITY_DIR/agents/"

count=0
for f in "$SKILLS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  skill_name="$(basename "$f" .md)"
  dest="$ANTIGRAVITY_DIR/skills/$skill_name"
  mkdir -p "$dest"
  cp "$f" "$dest/SKILL.md"
  log "  → $dest/SKILL.md"
  ((count++))
done
log "Synced $count skill(s) → $ANTIGRAVITY_DIR/skills/"

# ── Claude Code (global) ──────────────────────────────────────────────────────

mkdir -p "$CLAUDE_DIR/agents"
count=0
for f in "$AGENTS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  translate_tools_for_claude "$f" > "$CLAUDE_DIR/agents/$(basename "$f")"
  log "  → $CLAUDE_DIR/agents/$(basename "$f") (tools translated)"
  ((count++))
done
log "Synced $count agent(s) → $CLAUDE_DIR/agents/ (tools translated to Claude Code names)"

mkdir -p "$CLAUDE_DIR/commands"
count=0
for f in "$SKILLS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  cp "$f" "$CLAUDE_DIR/commands/$(basename "$f")"
  log "  → $CLAUDE_DIR/commands/$(basename "$f")"
  ((count++))
done
log "Synced $count skill(s) as commands → $CLAUDE_DIR/commands/"

# ── GitHub Copilot — personas only ───────────────────────────────────────────

COPILOT_FILE="$REGISTRY_DIR/.github/copilot-instructions.md"
mkdir -p "$(dirname "$COPILOT_FILE")"
{
  echo "<!-- AUTO-GENERATED by sync.sh — edit files in personas/ -->"
  echo ""
  for f in "$PERSONAS_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    strip_frontmatter "$f"
    echo ""
  done
} > "$COPILOT_FILE"
log "Compiled personas → $COPILOT_FILE"

# ── Gemini — personas only ────────────────────────────────────────────────────

GEMINI_FILE="$HOME/.gemini/GEMINI.md"
mkdir -p "$(dirname "$GEMINI_FILE")"
{
  echo "<!-- AUTO-GENERATED by sync.sh — edit files in personas/ -->"
  echo ""
  for f in "$PERSONAS_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    strip_frontmatter "$f"
    echo ""
  done
} > "$GEMINI_FILE"
log "Compiled personas → $GEMINI_FILE"

log "Done."
