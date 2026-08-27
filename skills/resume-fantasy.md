---
name: resume-fantasy
description: Resume Alex's "It's Business Time" Fantasy War Room context at the start of a new session — reloads memory, checks for uncommitted agent-registry changes, and reports what's still open before Sep 7 2026
arguments:
  - name: focus
    description: Optional specific thing to check on (e.g. "cheat sheet" or "Nacua suspension") — if omitted, give the full standard briefing
    required: false
---

# Resume Fantasy War Room Context

This is a session-start status briefing, not a fresh analysis — don't dispatch any specialist agents here, just reload and report.

## Directives

1. **Reload memory**: read the three fantasy-football memory files in full — `ff_league_settings.md`, `ff_draft_slot_decision.md`, `ff_war_room_workflow.md` (path: `~/.claude/projects/-Users-alexnesteruk/memory/`).
2. **Check the agent-registry repo** (`~/workspace/agent-registry`) for uncommitted changes via `git status --short` — report anything still pending (e.g. a prior edit never committed).
3. **Check the cheat sheet**: does `~/fantasy-football/cheat_sheet.md` exist? If so, read its `Generated:` line and its `Draft-Day Monitor Notes` / `Changelog` section. Flag if it's stale (built before today) and note it should be rebuilt via `/build-cheat-sheet` (mode=`refresh` for a quick check, mode=`full` for the real Sep 7 morning build).
4. **Compute days remaining** until the draft (Sep 7, 2026, 8:00 PM EDT) from today's date.
5. **Surface open items**: anything memory flags as unresolved (monitor-list items, team conflicts in the cheat sheet, pending tasks like an untested live-draft dry run).
6. If `{{focus}}` is given, answer that specifically after the briefing; otherwise give the full standard briefing below.

## Required Output Format

```
DAYS TO DRAFT: [N days, Sep 7 2026 8PM EDT]

PICK #2 STANCE: [current decision tree in 1-2 sentences]

REPO STATUS: [clean / N uncommitted files — list them]

CHEAT SHEET: [not built / built [date], N days stale — rebuild recommended via mode=X]

OPEN ITEMS:
- [unresolved monitor items, team conflicts, pending tasks]

NEXT STEP: [single most relevant thing to do this session]
```
