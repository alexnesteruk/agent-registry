---
name: roster-audit
description: Audit current team roster construction against 10-Team 0.5 PPR 2-FLEX starter demands and 5 bench slot constraints
arguments:
  - name: current_roster
    description: Current drafted roster breakdown by position
    required: true
  - name: current_round
    description: Current draft round (e.g. "Round 7")
    required: true
---

# Roster Construction Audit

Audit team build at **{{current_round}}** for a **10-Team 0.5 PPR** league with **9 Starters (1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 D/ST) and 5 Bench spots**.

## Audit Criteria

- **Starter Fill Rate**: Track filled starter slots vs remaining open starter slots (specifically 2 FLEX slots).
- **Flex Capital**: Assess total starting skill players (RB + WR + TE) drafted vs league demand.
- **Bench Efficiency**: Ensure zero bench spots are wasted on backup QBs, TEs, or DSTs.
- **Pivot Advice**: Recommend positional priority for the upcoming rounds.

---

## Required Output Format

```
ROSTER STATUS: [Starters Filled: X/9 | Bench Used: Y/5]
POSITION BREAKDOWN:
- QB: [Player(s)]
- RB: [Player(s)]
- WR: [Player(s)]
- TE: [Player(s)]
- D/ST: [Player(s)]

BUILD RATING: [Strong / Balanced / At-Risk]
NEXT PRIORITY: [1-2 sentences on what position/archetype to target next]
```
