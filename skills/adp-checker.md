---
name: adp-checker
description: Check ESPN ADP arbitrage and cross-reference Vegas season-long player props for target players
arguments:
  - name: player_name
    description: Name of the player to evaluate
    required: true
  - name: espn_adp
    description: Current ESPN ADP or draft position (e.g. "Pick 34")
    required: false
---

# Market & ADP Arbitrage Analysis

Perform a market value audit on **{{player_name}}** for an **ESPN 10-Team 0.5 PPR** league.

## Analysis Instructions

1. Use `web_search` to look up verified season-long player prop totals (O/U receiving/rushing yards and touchdowns) for {{player_name}}.
2. Compare {{player_name}}'s ESPN ADP ({{espn_adp}}) against sharp sportsbook prop totals and expert consensus value.
3. Identify if the player represents a **VALUE BUY**, **FADE**, or **REACH**.

---

## Required Output Format

```
PLAYER: [Player Name, Position, Team]
ESPN ADP: [Listed ADP or Pick Number]
VEGAS PROPS: [Season-long O/U yards & TD totals from sharp sportsbooks]
MARKET VERDICT: [VALUE BUY / FADE / REACH - 1-2 sentence justification]
```
