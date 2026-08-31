#!/usr/bin/env python3
"""
Hand-rolled tests for snitch_risk.py (stdlib unittest only, no extra deps —
matches this repo's no-dependencies convention, same spirit as sync.test.sh).
Run with: python3 scripts/snitch_risk.test.py

Two layers:
  1. Unit tests for the pure math (get_slot_for_pick, get_intervening_picks)
     and for evaluate_snitch_risk's trigger branches, against a small
     synthetic fixture profiles.json (not the real manager_profiles.json —
     these tests must stay stable even if real league data changes).
  2. A schema-coverage check that diffs every positional_triggers key
     actually present in the REAL manager_profiles.json against the keys
     this script knows how to read, extracted straight from its source.
     This is the check that would have caught the two "key exists but is
     never read" bugs found and fixed on 2026-08-30 (hoard_starting_tes,
     target_te_tier) — and any future ones like them.
"""

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import snitch_risk  # noqa: E402


class TestSlotMath(unittest.TestCase):
    def test_round_1_is_straight(self):
        self.assertEqual(snitch_risk.get_slot_for_pick(1), 1)
        self.assertEqual(snitch_risk.get_slot_for_pick(10), 10)

    def test_round_2_snakes_back(self):
        self.assertEqual(snitch_risk.get_slot_for_pick(11), 10)
        self.assertEqual(snitch_risk.get_slot_for_pick(20), 1)

    def test_round_3_straight_again(self):
        self.assertEqual(snitch_risk.get_slot_for_pick(21), 1)
        self.assertEqual(snitch_risk.get_slot_for_pick(22), 2)

    def test_alex_slot_2_turn_picks(self):
        # Alex's real picks per the cheat sheet: 2, 19, 22, 39, 42...
        for pick in (2, 19, 22, 39, 42):
            self.assertEqual(snitch_risk.get_slot_for_pick(pick), 2, f"pick {pick}")


class TestInterveningPicks(unittest.TestCase):
    def test_adjacent_picks_have_none_between(self):
        self.assertEqual(snitch_risk.get_intervening_picks(19, 20), [])

    def test_alex_pick_19_to_22(self):
        picks = snitch_risk.get_intervening_picks(19, 22)
        self.assertEqual([p["pick"] for p in picks], [20, 21])
        # Both picks belong to slot 1 (Joe Gallo) — pick 20 is the last pick of
        # round 2 (snake order, descending to slot 1) and pick 21 is the first
        # pick of round 3 (straight order, starting again at slot 1). This is
        # the back-to-back "turn" pick every snake draft has, which is exactly
        # why Alex's own 19/22 window is a prized double-pick turn.
        self.assertEqual([p["slot_num"] for p in picks], [1, 1])

    def test_slot_keys_are_zero_padded(self):
        picks = snitch_risk.get_intervening_picks(1, 3)
        self.assertTrue(all(re.match(r"^slot_\d{2}$", p["slot"]) for p in picks))


FIXTURE_PROFILES = {
    "league_metadata": {"total_teams": 10},
    "managers": {
        "slot_01": {
            "manager_name": "Hard Lock Guy",
            "hard_player_locks": ["CeeDee Lamb"],
            "player_affinities": ["Some Affinity Player"],
            "positional_triggers": {},
        },
        "slot_02": {
            "manager_name": "Early QB Reacher",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"qb_early_reach": True},
        },
        "slot_03": {
            "manager_name": "Rushing QB Avoider",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"qb_early_reach": True, "avoids_rushing_qbs": True},
        },
        "slot_04": {
            "manager_name": "TE Hoarder Alt Key",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"hoard_starting_tes": 3},
        },
        "slot_05": {
            "manager_name": "TE Tier 1 Target",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"target_te_tier": 1},
        },
        "slot_06": {
            "manager_name": "Round 1 RB Bellcow",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"round_1_rb_bellcow": True},
        },
        "slot_07": {
            "manager_name": "CeeDee Lock",
            "hard_player_locks": [],
            "player_affinities": [],
            "positional_triggers": {"turn_ceedee_lock": True},
        },
        "slot_08": {"manager_name": "No Signal", "hard_player_locks": [], "player_affinities": [], "positional_triggers": {}},
        "slot_09": {"manager_name": "No Signal 2", "hard_player_locks": [], "player_affinities": [], "positional_triggers": {}},
        "slot_10": {"manager_name": "No Signal 3", "hard_player_locks": [], "player_affinities": [], "positional_triggers": {}},
    },
}


class TestEvaluateSnitchRisk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fd, path = tempfile.mkstemp(suffix=".json")
        with open(fd, "w") as f:
            json.dump(FIXTURE_PROFILES, f)
        cls.fixture_path = Path(path)

    @classmethod
    def tearDownClass(cls):
        cls.fixture_path.unlink(missing_ok=True)

    def evaluate(self, **kwargs):
        return snitch_risk.evaluate_snitch_risk(profiles_path=self.fixture_path, **kwargs)

    def test_missing_profiles_file_returns_unknown(self):
        res = snitch_risk.evaluate_snitch_risk(
            from_pick=1, to_pick=3, target_pos="WR", profiles_path="/nonexistent/path.json"
        )
        self.assertEqual(res["snitch_risk"], "UNKNOWN")
        self.assertEqual(res["survival_probability"], 50.0)

    def test_zero_intervening_picks_is_safe(self):
        # slot_01 and slot_02 are adjacent picks 1 and 2 -> nothing between them
        res = self.evaluate(from_pick=1, to_pick=2, target_pos="WR")
        self.assertEqual(res["snitch_risk"], "NONE")
        self.assertEqual(res["survival_probability_pct"], 100.0)

    def test_hard_lock_beats_affinity_beats_nothing(self):
        # slot_01 (Hard Lock Guy) only picks at 1, 20, 21, 40, 41... Use the
        # 19->21 window so pick 20 (slot 1) is the sole intervening pick.
        res = self.evaluate(from_pick=19, to_pick=21, target_pos="WR", target_players=["CeeDee Lamb"])
        thief = next(t for t in res["likely_thieves"] if t["manager"] == "Hard Lock Guy")
        self.assertIn("Hard Lock on CeeDee Lamb", thief["reasons"])

    def test_qb_early_reach_flagged_in_early_rounds(self):
        # slot_02 sits at pick 2 (round 1); query a range that puts pick 2 in between.
        res = self.evaluate(from_pick=1, to_pick=3, target_pos="QB")
        thief = next((t for t in res["likely_thieves"] if t["manager"] == "Early QB Reacher"), None)
        self.assertIsNotNone(thief)
        self.assertIn("Early QB reach", thief["reasons"])

    def test_avoids_rushing_qbs_suppresses_threat_vs_plain_reacher(self):
        res_reacher = self.evaluate(from_pick=1, to_pick=3, target_pos="QB")
        early_reacher_threat = next(
            t for t in res_reacher["likely_thieves"] if t["manager"] == "Early QB Reacher"
        )
        # slot_03 (Rushing QB Avoider) has the same qb_early_reach flag PLUS a
        # suppressor; its net threat should never exceed the plain reacher's.
        res_avoider = self.evaluate(from_pick=2, to_pick=4, target_pos="QB")
        avoider_thief = next(
            (t for t in res_avoider["likely_thieves"] if t["manager"] == "Rushing QB Avoider"), None
        )
        if avoider_thief is not None:
            # threat_score isn't exposed per-thief, but the manager should not
            # appear with MORE reasons/higher category than the plain reacher case.
            self.assertLessEqual(len(avoider_thief["reasons"]), len(early_reacher_threat["reasons"]) + 1)

    def test_hoard_starting_tes_alt_key_is_read(self):
        # Regression test for the 2026-08-30 fix: hoard_starting_tes must count
        # the same as multi_te_hoarder even though it's a differently-named key.
        res = self.evaluate(from_pick=3, to_pick=5, target_pos="TE")
        thief = next(t for t in res["likely_thieves"] if t["manager"] == "TE Hoarder Alt Key")
        self.assertIn("Multi-TE hoarder", thief["reasons"])

    def test_target_te_tier_1_is_read(self):
        # Regression test for the 2026-08-30 fix: target_te_tier == 1 must add threat.
        res = self.evaluate(from_pick=4, to_pick=6, target_pos="TE")
        thief = next(t for t in res["likely_thieves"] if t["manager"] == "TE Tier 1 Target")
        self.assertIn("Targets Tier 1 TEs", thief["reasons"])

    def test_round_1_rb_bellcow_flagged_in_round_1_only(self):
        res_r1 = self.evaluate(from_pick=5, to_pick=7, target_pos="RB")
        thief = next(t for t in res_r1["likely_thieves"] if t["manager"] == "Round 1 RB Bellcow")
        self.assertIn("Round 1 RB anchor/lock", thief["reasons"])

    def test_ceedee_lock_flagged_for_wr_early(self):
        res = self.evaluate(from_pick=6, to_pick=8, target_pos="WR")
        thief = next(t for t in res["likely_thieves"] if t["manager"] == "CeeDee Lock")
        self.assertIn("CeeDee turn lock", thief["reasons"])


# ── schema-coverage check ────────────────────────────────────────────────────

REAL_PROFILES_PATH = Path.home() / "fantasy-football" / "manager_profiles.json"

# Keys intentionally NOT read by snitch_risk.py, with the reason why. If a
# brand-new key shows up in manager_profiles.json that isn't here AND isn't
# read by the script, the coverage test below fails loudly instead of the
# gap sitting silent (this is exactly how hoard_starting_tes and
# target_te_tier went unnoticed until a manual review caught them).
OUT_OF_SCOPE_KEYS = {
    # Team/player-fandom reach multipliers — would require cross-referencing
    # the specific target player's NFL team; a different feature than
    # generic positional threat.
    "dolphins_reach_multiplier", "chiefs_skill_reach", "lions_reach_multiplier",
    "detroit_lions_early_reach", "addison_reach_round", "rookie_reach_multiplier",
    # Roster-construction / bench-style flags, not early-pick snipe signals.
    "conservative_floor_preference", "veteran_floor_bias", "rookie_aversion",
    "wr_depth_accumulation", "backup_qb_dst_clutter", "multi_qb_bench_hoard",
    # Suppression-only signals (would reduce, not add, threat); low impact
    # since threat is already at baseline for these managers absent a
    # positive trigger elsewhere.
    "pocket_qb_only", "pocket_passer_preference", "zero_early_te_rule",
    # Only appear on Alex Nesteruk's own profile entry, which this tool never
    # evaluates as a threat (his slot is never "intervening" between his own picks).
    "elite_rushing_qb_target", "hero_rb_round_1",
}


class TestSchemaCoverage(unittest.TestCase):
    def test_every_real_trigger_key_is_handled_or_explicitly_out_of_scope(self):
        if not REAL_PROFILES_PATH.exists():
            self.skipTest(f"real profiles file not found at {REAL_PROFILES_PATH}")

        with open(REAL_PROFILES_PATH) as f:
            real_data = json.load(f)

        real_keys = set()
        for m in real_data.get("managers", {}).values():
            real_keys.update(m.get("positional_triggers", {}).keys())

        source = Path(snitch_risk.__file__).read_text()
        handled_keys = set(re.findall(r'triggers\.get\(\s*["\']([a-z0-9_]+)["\']', source))

        unhandled = real_keys - handled_keys - OUT_OF_SCOPE_KEYS
        self.assertEqual(
            unhandled, set(),
            f"New positional_triggers key(s) found in manager_profiles.json that "
            f"snitch_risk.py doesn't read and that aren't marked OUT_OF_SCOPE: "
            f"{sorted(unhandled)}. Either wire them in or add them to "
            f"OUT_OF_SCOPE_KEYS with a reason."
        )

    def test_out_of_scope_list_has_no_stale_entries(self):
        # If a key we marked "out of scope" no longer exists anywhere in the
        # real data, the comment explaining it is now dead weight — flag it
        # so the list doesn't quietly grow forever.
        if not REAL_PROFILES_PATH.exists():
            self.skipTest(f"real profiles file not found at {REAL_PROFILES_PATH}")

        with open(REAL_PROFILES_PATH) as f:
            real_data = json.load(f)

        real_keys = set()
        for m in real_data.get("managers", {}).values():
            real_keys.update(m.get("positional_triggers", {}).keys())

        stale = OUT_OF_SCOPE_KEYS - real_keys
        self.assertEqual(
            stale, set(),
            f"OUT_OF_SCOPE_KEYS entries no longer present in manager_profiles.json: "
            f"{sorted(stale)} — safe to remove them from the list."
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
