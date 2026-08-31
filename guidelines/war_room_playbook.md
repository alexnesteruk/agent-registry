# Fantasy Football AI War Room — Standard Operating Procedure (SOP)

This document defines the architecture, operational modes, and execution rules for Alex's 5-Agent Fantasy War Room.

---

## 1. Multi-Agent System Architecture

The War Room uses a hierarchical 4+1 agent structure designed to prevent consensus bias and force explicit conflict resolution:

```
                      ┌────────────────────────┐
                      │    draft-commander     │
                      │  (Head Coach / Final)  │
                      └───────────┬────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
┌────────┴────────┐      ┌────────┴────────┐      ┌────────┴────────┐      ┌─────────────────┐
│scouting-analyst │      │quantitative-    │      │game-theory-     │      │market-and-odds- │
│(Injury/Scheme)  │      │analyst (VORP)   │      │strategist (Runs)│      │specialist (Vegas)
└─────────────────┘      └─────────────────┘      └─────────────────┘      └─────────────────┘
```

### Specialist Lane Rules:
1. **`scouting-analyst`:** Evaluates qualitative factors only: injury status, coaching scheme, depth chart path, talent profile.
2. **`quantitative-analyst`:** Evaluates mathematical value only: Half-PPR VORP, volume baselines, tier drop-offs, regression metrics.
3. **`game-theory-strategist`:** Evaluates draft board dynamics: pick order, turn survival odds, opponent tendencies, run anticipation.
4. **`market-and-odds-specialist`:** Evaluates market price: ESPN ADP vs. consensus, Vegas win totals, touchdown props, betting arbitrage.
5. **`draft-commander` (Synthesizer):** Synthesizes all 4 reports, explicitly reconciles conflicts, and renders the final draft/roster decision.

---

## 2. Operational Modes

### Mode 1: Pre-Draft War Room (`/build-cheat-sheet`)
* **When:** Days/weeks before the draft (Sep 7, 2026).
* **Execution:** Full asynchronous 4-agent dispatch across ~100+ players.
* **Output:** Generates or refreshes `~/fantasy-football/cheat_sheet.md` with pre-computed tiers, VORP, turn targets, and player monitor notes.
* **Timing:** Can take 2–5 minutes. Never run during a live draft clock.

### Mode 2: Live Draft War Room (`/draft-command`)
* **When:** Live draft night (Sep 7, 2026 @ 8:00 PM EDT) under the **90-second pick clock**.
* **Execution:** **Instant cheat sheet lookup (<2 seconds).** Zero WebSearch or live sub-agent dispatch calls. The deterministic `scripts/snitch_risk.py` calculator IS allowed on the clock (it's a fast local script, not a dispatch) — invoke it by absolute path: `python3 ~/workspace/agent-registry/scripts/snitch_risk.py`.
* **Exception:** A single targeted specialist check is allowed ONLY if breaking news occurs with ample runway (>3 minutes) before Alex's turn.

---

## 3. Live Draft Cadence & Protocol

1. **Dead Time Window (~10–13 minutes):**
   * While the other 8 managers pick between Alex's turns (e.g., between pick 22 and pick 39), Alex pastes recent picks and the top available board.
   * War Room updates the queue and preps recommendations before Alex is on the clock.
2. **On-The-Clock Window (90 seconds):**
   * Alex triggers `/draft-command` with the pick number, current roster, and top-available board (one free-text blob — the skill parses it).
   * War Room returns the skill's fixed output block instantly: **THE PICK**, **THE RUNNER-UP**, **COMMANDER'S SYNTHESIS**, **ROSTER CHECK**, **ON THE HORIZON (NEXT TURN)**. (This is the authoritative live-output contract — defined in `skills/draft-command.md`.)

---

## 4. Reusable Fantasy Skills in Registry

* **`/draft-command`** (`skills/draft-command.md`): Evaluates on-the-clock draft turns in Mode 2.
* **`/build-cheat-sheet`** (`skills/build-cheat-sheet.md`): Compiles/refreshes `cheat_sheet.md` in Mode 1.
* **`/resume-fantasy`** (`skills/resume-fantasy.md`): Fast session status briefing (days to draft, repo status, open items).
* **`/roster-audit`** (`skills/roster-audit.md`): Audits starting lineup and shallow bench constraints.
* **`/adp-checker`** (`skills/adp-checker.md`): Evaluates ESPN ADP arbitrage against Vegas odds.
