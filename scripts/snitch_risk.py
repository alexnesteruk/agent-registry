#!/usr/bin/env python3
"""
snitch_risk.py — Deterministic Board Sniping & Turn Survival Calculator
Calculates exact survival probabilities and snitch risks between draft turns
using structured historical manager profiles for "It's Business Time".
"""

import sys
import json
import argparse
from pathlib import Path

DEFAULT_PROFILES_PATH = Path.home() / "fantasy-football" / "manager_profiles.json"

def get_slot_for_pick(pick_num: int, total_teams: int = 10) -> int:
    """Returns the 1-based draft slot (1-10) for any overall pick number in a snake draft."""
    round_num = (pick_num - 1) // total_teams + 1
    pos_in_round = (pick_num - 1) % total_teams + 1
    if round_num % 2 == 1:
        return pos_in_round
    else:
        return total_teams - pos_in_round + 1

def get_intervening_picks(from_pick: int, to_pick: int, total_teams: int = 10):
    """Returns a list of dicts with pick number and manager slot between from_pick and to_pick."""
    picks = []
    for p in range(from_pick + 1, to_pick):
        slot = get_slot_for_pick(p, total_teams)
        picks.append({"pick": p, "slot": f"slot_{slot:02d}", "slot_num": slot})
    return picks

def evaluate_snitch_risk(from_pick: int, to_pick: int, target_pos: str, target_players=None, tier_depth: int = 1, profiles_path=None):
    if profiles_path is None:
        profiles_path = DEFAULT_PROFILES_PATH
    
    if not Path(profiles_path).exists():
        return {
            "error": f"Manager profiles file not found at {profiles_path}",
            "snitch_risk": "UNKNOWN",
            "survival_probability": 50.0
        }

    with open(profiles_path, "r") as f:
        data = json.load(f)
    
    managers = data.get("managers", {})
    intervening = get_intervening_picks(from_pick, to_pick, total_teams=data.get("league_metadata", {}).get("total_teams", 10))
    
    target_players = [p.strip() for p in target_players] if target_players else []
    target_pos = target_pos.upper() if target_pos else "FLEX"
    
    threat_score = 0.0
    likely_thieves = []
    
    for pick_info in intervening:
        slot_key = pick_info["slot"]
        mgr = managers.get(slot_key, {})
        mgr_name = mgr.get("manager_name", f"Manager {pick_info['slot_num']}")
        triggers = mgr.get("positional_triggers", {})
        affinities = [a.lower() for a in mgr.get("player_affinities", [])]
        hard_locks = [h.lower() for h in mgr.get("hard_player_locks", [])]
        
        pick_threat = 0.0
        threat_reasons = []
        
        # 1. Direct Hard Player Lock
        for tp in target_players:
            if tp.lower() in hard_locks:
                pick_threat += 1.0
                threat_reasons.append(f"Hard Lock on {tp}")
            elif tp.lower() in affinities:
                pick_threat += 0.65
                threat_reasons.append(f"Strong affinity for {tp}")
        
        # 2. Positional Triggers & Behavior
        round_num = (pick_info["pick"] - 1) // 10 + 1
        
        if target_pos == "QB":
            qb_round_range = triggers.get("early_qb_round_target") or triggers.get("rushing_qb_target")
            mid_qb_range = triggers.get("mid_round_qb_target")
            if triggers.get("qb_early_reach") and round_num <= 4:
                pick_threat += 0.55
                threat_reasons.append("Early QB reach")
            if triggers.get("dual_elite_qb_habit") and round_num <= 5:
                pick_threat += 0.50
                threat_reasons.append("Dual-elite QB habit")
            if triggers.get("dual_threat_qb_early_reach") and round_num <= 4:
                pick_threat += 0.55
                threat_reasons.append("Dual-threat QB early reach")
            if qb_round_range and len(qb_round_range) == 2 and qb_round_range[0] <= round_num <= qb_round_range[1]:
                pick_threat += 0.45
                threat_reasons.append(f"QB target window rounds {qb_round_range[0]}-{qb_round_range[1]}")
            if mid_qb_range and len(mid_qb_range) == 2 and mid_qb_range[0] <= round_num <= mid_qb_range[1]:
                pick_threat += 0.35
                threat_reasons.append(f"Mid-round QB target rounds {mid_qb_range[0]}-{mid_qb_range[1]}")
            if triggers.get("avoids_rushing_qbs") or triggers.get("zero_rushing_qb_appetite") or triggers.get("late_round_pocket_qb"):
                pick_threat = max(0.0, pick_threat - 0.30)

        elif target_pos == "TE":
            te_round_range = triggers.get("elite_te_target")
            if triggers.get("early_te_buyer") and round_num <= 4:
                pick_threat += 0.70
                threat_reasons.append("Early TE addict")
            if te_round_range and len(te_round_range) == 2 and te_round_range[0] <= round_num <= te_round_range[1]:
                pick_threat += 0.65
                threat_reasons.append(f"Elite TE target window rounds {te_round_range[0]}-{te_round_range[1]}")
            if triggers.get("multi_te_hoarder") or triggers.get("hoard_starting_tes"):
                pick_threat += 0.50
                threat_reasons.append("Multi-TE hoarder")
            if triggers.get("starts_two_tes"):
                pick_threat += 0.45
                threat_reasons.append("Starts 2 TEs")
            if triggers.get("target_te_tier") == 1:
                pick_threat += 0.45
                threat_reasons.append("Targets Tier 1 TEs")

        elif target_pos == "RB":
            if round_num == 1 and (triggers.get("round_1_rb_anchor") or triggers.get("round_1_rb_lock")
                                    or triggers.get("round_1_rb_bellcow") or triggers.get("round_1_hero_rb")):
                pick_threat += 0.85
                threat_reasons.append("Round 1 RB anchor/lock")
            if triggers.get("rb_first_round_multiplier", 1.0) > 1.0 and round_num == 1:
                pick_threat += 0.25
                threat_reasons.append("Elevated Round 1 RB multiplier")
            # No structured signal exists yet for post-Round-1 RB hoarding intensity
            # (opponents.md flags several managers as chronic RB hoarders in prose,
            # but manager_profiles.json does not encode it as a queryable trigger).

        elif target_pos == "WR":
            if triggers.get("turn_ceedee_lock") and round_num <= 2:
                pick_threat += 0.70
                threat_reasons.append("CeeDee turn lock")
            if triggers.get("round_1_rookie_wr_lock") and round_num == 1:
                pick_threat += 0.60
                threat_reasons.append("Round 1 rookie WR lock")
            if triggers.get("wr_flex_depth"):
                pick_threat += 0.20
                threat_reasons.append("WR/FLEX depth accumulator")
        
        # Baseline positional draw per pick if no specific trigger
        if pick_threat == 0.0:
            pick_threat = 0.25  # normal board distribution
        
        threat_score += min(1.0, pick_threat)
        if pick_threat >= 0.40:
            likely_thieves.append({
                "pick": pick_info["pick"],
                "manager": mgr_name,
                "slot": pick_info["slot_num"],
                "reasons": threat_reasons or [f"Projected {target_pos} demand"]
            })
    
    # Calculate survival odds
    # If threat_score >= tier_depth, probability is low
    survival_ratio = max(0.0, (tier_depth - threat_score) / max(1, tier_depth))
    survival_prob = round(min(100.0, max(5.0, survival_ratio * 100.0)), 1)
    
    if len(intervening) == 0:
        snitch_risk = "NONE"
        survival_prob = 100.0
        action = "WAIT_FOR_TURN"
    elif threat_score >= tier_depth * 1.1:
        snitch_risk = "CRITICAL"
        action = "TAKE_NOW_AT_CURRENT_PICK"
    elif threat_score >= tier_depth * 0.75:
        snitch_risk = "HIGH"
        action = "TAKE_NOW_IF_PRIMARY_TARGET"
    elif threat_score >= tier_depth * 0.40:
        snitch_risk = "MODERATE"
        action = "WEIGH_VS_OTHER_NEEDS"
    else:
        snitch_risk = "LOW"
        action = "SAFE_TO_WAIT_FOR_TURN"

    return {
        "from_pick": from_pick,
        "to_pick": to_pick,
        "intervening_picks_count": len(intervening),
        "target_position": target_pos,
        "target_players": target_players,
        "tier_depth": tier_depth,
        "total_threat_score": round(threat_score, 2),
        "survival_probability_pct": survival_prob,
        "snitch_risk": snitch_risk,
        "recommended_action": action,
        "likely_thieves": likely_thieves
    }

def main():
    parser = argparse.ArgumentParser(description="Deterministic Board Sniping & Turn Survival Calculator")
    parser.add_argument("--from-pick", type=int, required=True, help="Current pick number (e.g. 19)")
    parser.add_argument("--to-pick", type=int, required=True, help="Your next pick number (e.g. 22)")
    parser.add_argument("--pos", type=str, default="WR", help="Target position (QB, RB, WR, TE)")
    parser.add_argument("--players", type=str, default="", help="Comma-separated player names")
    parser.add_argument("--tier-depth", type=int, default=1, help="Number of equivalent players remaining in this tier")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    
    args = parser.parse_args()
    players = [p.strip() for p in args.players.split(",")] if args.players else []
    
    res = evaluate_snitch_risk(
        from_pick=args.from_pick,
        to_pick=args.to_pick,
        target_pos=args.pos,
        target_players=players,
        tier_depth=args.tier_depth
    )
    
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"\n=======================================================")
        print(f"  SNITCH RISK REPORT: Pick {args.from_pick} ➔ Pick {args.to_pick}")
        print(f"=======================================================")
        print(f"• Intervening Picks: {res['intervening_picks_count']}")
        print(f"• Target Position:   {res['target_position']} (Tier Depth: {res['tier_depth']})")
        if players:
            print(f"• Target Players:    {', '.join(players)}")
        print(f"• Snitch Risk:       {res['snitch_risk']}")
        print(f"• Survival Odds:     {res['survival_probability_pct']}%")
        print(f"• Recommended Call:  {res['recommended_action']}")
        
        if res["likely_thieves"]:
            print(f"\nPotential Snipers Between Your Picks:")
            for t in res["likely_thieves"]:
                print(f"  - Pick {t['pick']} (Slot {t['slot']} - {t['manager']}): {', '.join(t['reasons'])}")
        print(f"=======================================================\n")

if __name__ == "__main__":
    main()
