#!/usr/bin/env bash
# Hand-rolled tests for sync.sh (no test framework, matches this repo's
# no-dependencies convention). Run with: bash scripts/sync.test.sh
#
# Two layers:
#   1. Unit tests for the pure translate_tools_for_*/strip_frontmatter
#      functions, against small fixtures (not the real agents/*.md).
#   2. One integration test that runs the real main() sync against the
#      real source content, with every global target dir redirected to a
#      temp directory so it never touches your actual ~/.claude, ~/.opencode,
#      ~/.copilot, ~/.gemini, ~/.agents.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

# shellcheck source=sync.sh
source "$SCRIPT_DIR/sync.sh"

pass=0
fail=0

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    printf 'FAIL: %s\n  expected to contain: %s\n  got:\n%s\n' "$label" "$needle" "$haystack"
  fi
}

assert_not_contains() {
  local label="$1" haystack="$2" needle="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    printf 'FAIL: %s\n  expected NOT to contain: %s\n  got:\n%s\n' "$label" "$needle" "$haystack"
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    printf 'FAIL: %s\n  expected file to exist: %s\n' "$label" "$path"
  fi
}

# ── fixtures ──────────────────────────────────────────────────────────────────

BLOCK_LIST_FIXTURE="$FIXTURE_DIR/block-list.md"
cat > "$BLOCK_LIST_FIXTURE" <<'EOF'
---
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
EOF

INLINE_ARRAY_FIXTURE="$FIXTURE_DIR/inline-array.md"
cat > "$INLINE_ARRAY_FIXTURE" <<'EOF'
---
name: inline-fixture
description: uses inline array tools, like expert-react-frontend-developer.md
tools: ["codebase", "editFiles", "runInTerminal"]
---

Body.
EOF

NO_TOOLS_FIXTURE="$FIXTURE_DIR/no-tools.md"
cat > "$NO_TOOLS_FIXTURE" <<'EOF'
---
name: no-tools-fixture
description: has no tools or skills at all
---

Body.
EOF

# ── strip_frontmatter ─────────────────────────────────────────────────────────

out="$(strip_frontmatter "$BLOCK_LIST_FIXTURE")"
assert_not_contains "strip_frontmatter drops the frontmatter block" "$out" "name: fixture-agent"
assert_contains "strip_frontmatter keeps the body" "$out" "Body text here."

# ── translate_tools_for_claude ────────────────────────────────────────────────

out="$(translate_tools_for_claude "$BLOCK_LIST_FIXTURE")"
assert_contains "claude: read_file -> Read" "$out" "  - Read"
assert_contains "claude: write_file -> Write" "$out" "  - Write"
assert_contains "claude: run_terminal_cmd -> Bash" "$out" "  - Bash"
assert_contains "claude: web_search -> WebSearch" "$out" "  - WebSearch"
assert_not_contains "claude: no leftover generic names" "$out" "read_file"

out="$(translate_tools_for_claude "$INLINE_ARRAY_FIXTURE")"
assert_contains "claude: inline array tools pass through untouched (no block-list match)" "$out" 'tools: ["codebase", "editFiles", "runInTerminal"]'

# ── translate_tools_for_opencode ──────────────────────────────────────────────

out="$(translate_tools_for_opencode "$BLOCK_LIST_FIXTURE")"
assert_contains "opencode: tools: key replaced by permission:" "$out" "permission:"
assert_not_contains "opencode: no leftover tools: key" "$out" "tools:"
assert_contains "opencode: read_file -> read" "$out" "  read: allow"
assert_contains "opencode: write_file -> edit" "$out" "  edit: allow"
assert_contains "opencode: run_terminal_cmd -> bash" "$out" "  bash: allow"
assert_contains "opencode: web_search -> websearch" "$out" "  websearch: allow"
assert_contains "opencode: skills: present -> skill: allow" "$out" "  skill: allow"

out="$(translate_tools_for_opencode "$NO_TOOLS_FIXTURE")"
assert_not_contains "opencode: no tools/skills -> no permission: block added" "$out" "permission:"

# Inline-array tools: (as used by expert-react-frontend-developer.md) have no
# real OpenCode equivalent, so they're translated to an explicit deny-all
# rather than silently dropped (which previously granted default/broad access
# instead of the intended restriction, a real bug this test caught).
out="$(translate_tools_for_opencode "$INLINE_ARRAY_FIXTURE")"
assert_not_contains "opencode: inline array tools: key removed" "$out" "tools:"
assert_contains "opencode: inline array tools -> explicit deny-all" "$out" "  read: deny"
assert_contains "opencode: inline array tools -> deny edit" "$out" "  edit: deny"
assert_contains "opencode: inline array tools -> deny bash" "$out" "  bash: deny"
assert_contains "opencode: inline array tools -> deny webfetch" "$out" "  webfetch: deny"
assert_contains "opencode: inline array tools -> deny websearch" "$out" "  websearch: deny"

# ── translate_tools_for_copilot ───────────────────────────────────────────────

out="$(translate_tools_for_copilot "$BLOCK_LIST_FIXTURE")"
assert_contains "copilot: read_file -> readFile" "$out" "  - readFile"
assert_contains "copilot: write_file -> editFiles" "$out" "  - editFiles"
assert_contains "copilot: run_terminal_cmd -> runInTerminal" "$out" "  - runInTerminal"
assert_contains "copilot: web_search -> fetch" "$out" "  - fetch"
assert_not_contains "copilot: no leftover generic names" "$out" "read_file"

out="$(translate_tools_for_copilot "$INLINE_ARRAY_FIXTURE")"
assert_contains "copilot: inline array tools pass through untouched" "$out" 'tools: ["codebase", "editFiles", "runInTerminal"]'

# ── integration: full main() run against real source content, temp dirs ──────

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR" "$TMP_ROOT"' EXIT

OPENCODE_DIR="$TMP_ROOT/opencode" \
ANTIGRAVITY_DIR="$TMP_ROOT/agents" \
CLAUDE_DIR="$TMP_ROOT/claude" \
COPILOT_DIR="$TMP_ROOT/copilot" \
GEMINI_DIR="$TMP_ROOT/gemini" \
main > "$TMP_ROOT/sync.log" 2>&1
sync_exit=$?

if [[ "$sync_exit" -eq 0 ]]; then
  pass=$((pass+1))
else
  fail=$((fail+1))
  printf 'FAIL: integration: main() exited %s\n  log:\n%s\n' "$sync_exit" "$(cat "$TMP_ROOT/sync.log")"
fi

assert_file_exists "integration: OpenCode agent synced"       "$TMP_ROOT/opencode/agents/angular-developer.md"
assert_file_exists "integration: OpenCode persona synced"     "$TMP_ROOT/opencode/personas/senior-engineer.md"
assert_file_exists "integration: OpenCode skill synced"       "$TMP_ROOT/opencode/skills/explain-code.md"
assert_file_exists "integration: Antigravity agent synced"    "$TMP_ROOT/agents/agents/angular-developer/agent.md"
assert_file_exists "integration: Antigravity skill synced"    "$TMP_ROOT/agents/skills/explain-code/SKILL.md"
assert_file_exists "integration: Claude Code agent synced"    "$TMP_ROOT/claude/agents/angular-developer.md"
assert_file_exists "integration: Claude Code skill-as-command synced" "$TMP_ROOT/claude/commands/explain-code.md"
assert_file_exists "integration: Copilot agent synced"        "$TMP_ROOT/copilot/agents/angular-developer.agent.md"
assert_file_exists "integration: Gemini personas compiled"    "$TMP_ROOT/gemini/GEMINI.md"

claude_agent="$(cat "$TMP_ROOT/claude/agents/angular-developer.md")"
assert_contains "integration: Claude Code agent has translated tools" "$claude_agent" "  - Read"

copilot_agent="$(cat "$TMP_ROOT/copilot/agents/angular-developer.agent.md")"
assert_contains "integration: Copilot agent has translated tools" "$copilot_agent" "  - readFile"

opencode_agent="$(cat "$TMP_ROOT/opencode/agents/angular-developer.md")"
assert_contains "integration: OpenCode agent has permission: block" "$opencode_agent" "permission:"

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
