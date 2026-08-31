---
name: build-cheat-sheet
description: Build or refresh the pre-draft tiered cheat sheet for the "It's Business Time" Fantasy War Room by dispatching all 4 specialist agents across the likely player pool
argument-hint: "[mode=full|refresh] [free-text build notes, e.g. \"practice version\" / \"final Sep 7 morning build\"]"
---

# Build Pre-Draft Cheat Sheet

You are the **Draft Commander** building the pre-draft cheat sheet for the **"It's Business Time"** Fantasy Football War Room (10-Team, 0.5 PPR, 2 FLEX, 5 Bench, ESPN Snake Draft, Sep 7 2026). This is a **pre-draft, offline build** — not a live pick evaluation. Take as much time as needed; there is no 90-second clock here.

**Inputs are in `$ARGUMENTS` as free text — parse them:**
- **Mode** — `mode=full` or `mode=refresh` (also accept a bare `full` / `refresh`). If not stated, treat as `full`.
- **Build notes** — any remaining text is context to bias the build (e.g. "practice/test version" vs "final pre-draft version, Sep 7 morning"). Carry it into the `Generated:` line.

---

## Mode 1: `full` (default)

1. **Dispatch all 4 specialist sub-agents in parallel** (single message, multiple Task calls) — `scouting-analyst`, `quantitative-analyst`, `market-and-odds-specialist`, `game-theory-strategist`. Each should cover the full likely-draft player pool (roughly top 100-120 overall by current ADP), broken out by position (RB, WR, TE as primary focus since they're FLEX-eligible and decision-heavy in this 2-FLEX league; QB and D/ST get a short late-round streaming note only, per the shallow-bench rule — do not deep-dive individual backup QBs/D/STs).
2. **Keep each specialist's output compact**: tiered lists with a one-line note per player or per tier (health flag, scheme fit, VORP-tier-cliff, ADP-arbitrage signal), not per-player deep-dive essays — this keeps the build fast and the output usable as a lookup table, not prose to re-read live. **Always include the player's team** in every entry — never leave a bare `[team]` placeholder; if a specialist genuinely doesn't know, write `[team TBD — verify Sep 7]` explicitly rather than omitting it.
3. **Synthesize into ONE tiered cheat sheet**, resolving disagreements between specialists explicitly (don't average) the same way a live Draft Commander synthesis would. If two specialists give a player different teams, don't silently pick one — flag it as `TEAM CONFLICT: [source A] says X, [source B] says Y — verify Sep 7`.
4. **Write the result** to `~/fantasy-football/cheat_sheet.md` (create the directory if it doesn't exist), **overwriting** any previous version.

## Mode 2: `refresh` (fast interim rebuild)

Use when a cheat sheet already exists at `~/fantasy-football/cheat_sheet.md` and you want to catch what's changed since the last build without redoing the full research pass.

1. **Read the existing cheat sheet.** Extract its "Draft-Day Monitor Notes" section and any `TEAM CONFLICT` / `[team TBD]` flags — these are the specific open items that most likely moved.
2. **Dispatch all 4 specialists in parallel with a narrow brief**: (a) re-check each flagged monitor item / conflict specifically via fresh WebSearch, and (b) do one broad sweep for any *new* breaking news (injury, suspension, trade, depth-chart shakeup) that could affect a player currently listed as "clean" — but do NOT re-derive VORP/ADP/tiers from scratch for players with no flag and no new news. This should be materially faster than Mode 1's full pool pass.
3. **Synthesize as a diff, not a rewrite**: only change the specific lines/tiers that actually moved. Leave everything else untouched. Bump the `Generated:` timestamp and prepend a short **Changelog** section immediately under it listing what changed since the last build (e.g., "Nacua suspension: cleared, no games missed — upgraded to full Tier 1 confidence" or "Cook team conflict: confirmed BUF, conflict resolved").
4. **Write the result** to `~/fantasy-football/cheat_sheet.md`, overwriting the previous version with the updated-in-place file.

If asked to refresh but no existing cheat sheet is found, fall back to Mode 1 (`full`) automatically and note that in the output.

---

## Required Cheat Sheet File Format

```markdown
# Cheat Sheet — It's Business Time — Draft Sep 7, 2026
Generated: [date] — [practice/final, from the build notes in $ARGUMENTS]

## Changelog (refresh mode only — omit entirely on a `full` build)
[What changed since the last build, one line per item]

## RB
Tier 1: [Player] ([Team], ADP [x.xx]) — [one-line note]
Tier 2: ...
...

## WR
[same tier format]

## TE
[same tier format]

## QB (stream late — do not draft before final rounds per shallow-bench rule)
[short list, 1 line each]

## D/ST (stream late — do not draft before final rounds per shallow-bench rule)
[short list, 1 line each]

## Draft-Day Monitor Notes
[Anything time-sensitive that could shift a tier before Sep 7 — injuries, contract disputes, depth-chart battles still unresolved]
```

This file is what `/draft-command` reads live during actual picks — keep it scannable, not verbose.
