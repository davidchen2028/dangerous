"""全服同一世界：L1 保护、基地、火盐对人、倒地救援、拾取。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as app_module  # noqa: E402
import backrooms_world as world  # noqa: E402
import db  # noqa: E402


class BackroomsWorldTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_db_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "test.db"
        db.init_db()
        world.reset_world()
        app_module.app.config.update(TESTING=True, ADMIN_ONLY=False)
        app_module.sessions_by_sid.clear()
        app_module.sid_by_user_id.clear()
        self.user_a = db.create_user("甲", generate_password_hash("secret12"))
        self.user_b = db.create_user("乙", generate_password_hash("secret12"))
        self.token_a = "world-a"
        self.token_b = "world-b"
        db.create_session(self.user_a, self.token_a)
        db.create_session(self.user_b, self.token_b)

    def tearDown(self) -> None:
        world.reset_world()
        app_module.sessions_by_sid.clear()
        app_module.sid_by_user_id.clear()
        db.DB_PATH = self.old_db_path
        self.tempdir.cleanup()

    def _sess(self, user_id: int, nick: str, ip: str = "203.0.113.10"):
        return {
            "user_id": user_id,
            "nickname": nick,
            "scope": "backrooms",
            "ip": ip,
        }

    def _hello(self, user_id: int, sid: str, nick: str, level: str, x: float, z: float, **extra):
        data = {"levelKey": level, "x": x, "z": z, "yaw": 0}
        data.update(extra)
        return world.hello(sid, self._sess(user_id, nick), data)

    def _give_salt(self, user_id: int) -> None:
        actor = world.get_actor(user_id)
        actor["inventory"] = [{"id": "fire_salt", "name": "火盐"}]

    def test_l1_protect_blocks_damage_then_expires(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        self._hello(self.user_b, "sb", "乙", "clip", 210, 18)
        a = world.get_actor(self.user_a)
        b = world.get_actor(self.user_b)
        self.assertGreater(a["protect_until"], world.now())
        applied, reason = world.apply_player_damage(a, b, 60, "fire_salt")
        self.assertEqual(applied, 0)
        self.assertEqual(reason, "protect")
        b["protect_until"] = 0
        a["x"], a["z"] = 240.0, 40.0
        b["x"], b["z"] = 241.0, 40.0
        applied, reason = world.apply_player_damage(a, b, 60, "fire_salt")
        self.assertEqual(applied, 60)
        self.assertEqual(reason, "ok")
        self.assertEqual(a["protect_until"], 0)

    def test_hitting_protected_player_cancels_attacker_protection(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 240, 40)
        self._hello(self.user_b, "sb", "乙", "clip", 241, 40)
        a = world.get_actor(self.user_a)
        b = world.get_actor(self.user_b)
        applied, reason = world.apply_player_damage(a, b, 60, "fire_salt")
        self.assertEqual((applied, reason), (0, "protect"))
        self.assertEqual(a["protect_until"], 0)

    def test_fire_salt_requires_server_inventory(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        a = world.get_actor(self.user_a)
        a["inventory"] = []
        result = world.weapon_fire(
            "sa",
            {"weapon": "fire_salt", "explodeX": 1, "explodeY": 0, "explodeZ": 1},
        )
        self.assertEqual(result, {"ok": False, "reason": "no_ammo"})

    def test_client_hp_needs_matching_version(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        a = world.get_actor(self.user_a)
        version = a["hp_version"]
        # 客户端确认过当前版本：单机 PvE 掉血被采信。
        world.apply_input("sa", {"x": 198, "z": 18, "hp": 70, "hpVersion": version})
        self.assertEqual(a["hp"], 70)
        self.assertEqual(a["hp_version"], version)

        # 服务端判定 PvP 伤害后版本前进，客户端回传的旧血量不得覆盖。
        self._hello(self.user_b, "sb", "乙", "clip", 199, 18)
        b = world.get_actor(self.user_b)
        a["protect_until"] = 0
        a["x"], a["z"] = 240.0, 40.0
        b["x"], b["z"] = 241.0, 40.0
        b["protect_until"] = 0
        world.apply_player_damage(b, a, 30, "fire_salt")
        self.assertEqual(a["hp"], 40)
        self.assertGreater(a["hp_version"], version)
        a["last_input_packet_at"] = 0
        world.apply_input("sa", {"x": 240, "z": 40, "hp": 70, "hpVersion": version})
        self.assertEqual(a["hp"], 40)

    def test_client_hp_zero_downs_player(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        a = world.get_actor(self.user_a)
        world.apply_input("sa", {"x": 198, "z": 18, "hp": 0, "hpVersion": a["hp_version"]})
        self.assertTrue(a["downed"])

    def test_bleedout_forces_client_teleport(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 260, 60)
        a = world.get_actor(self.user_a)
        before = a["force_pos_version"]
        world._enter_downed(a)
        world.finish_bleedout(a)
        self.assertEqual((a["x"], a["z"]), world._meg_spawn_for(self.user_a))
        self.assertGreater(a["force_pos_version"], before)
        view = world._self_view(a)
        self.assertEqual(view["forcePos"]["version"], a["force_pos_version"])

    def test_meg_base_zero_damage(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", world.MEG_BASE_X, world.MEG_BASE_Z)
        self._hello(self.user_b, "sb", "乙", "clip", world.MEG_BASE_X + 1, world.MEG_BASE_Z)
        a = world.get_actor(self.user_a)
        b = world.get_actor(self.user_b)
        a["protect_until"] = 0
        b["protect_until"] = 0
        applied, reason = world.apply_player_damage(a, b, 60, "fire_salt")
        self.assertEqual(applied, 0)
        self.assertEqual(reason, "base")

    def test_firesalt_and_revive(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        self._hello(self.user_b, "sb", "乙", "l4", 1, 0)
        self._give_salt(self.user_a)
        a = world.get_actor(self.user_a)
        b = world.get_actor(self.user_b)
        b["hp"] = 50
        result = world.weapon_fire(
            "sa",
            {"weapon": "fire_salt", "explodeX": 1, "explodeY": 1, "explodeZ": 0},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["hits"][0]["applied"], 60)
        self.assertTrue(b["downed"])
        hold = world.revive_hold("sa", {"userId": self.user_b})
        self.assertTrue(hold["ok"])
        world.tick(world.REVIVE_HOLD_SEC + 0.05)
        self.assertFalse(b["downed"])
        self.assertGreater(b["iframe_until"], world.now())
        self.assertAlmostEqual(b["hp"], world.DOWNED_REVIVE_HP)

    def test_pickup_is_unique(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        self._hello(self.user_b, "sb", "乙", "clip", 198, 18)
        first = world.claim_pickup(
            "sa", {"key": "l1:chest:10:10:firesalt", "itemId": "fire_salt", "name": "火盐"}
        )
        second = world.claim_pickup(
            "sb", {"key": "l1:chest:10:10:firesalt", "itemId": "fire_salt", "name": "火盐"}
        )
        self.assertTrue(first["ok"])
        self.assertFalse(second["ok"])
        self.assertEqual(second["reason"], "taken")

    def test_disconnect_hold_then_drop(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        world.mark_disconnect(self.user_a, "sa")
        self.assertIsNotNone(world.get_actor(self.user_a))
        actor = world.get_actor(self.user_a)
        actor["disconnected_at"] = world.now() - world.DISCONNECT_HOLD_SEC - 1
        world.tick(0.05)
        self.assertIsNone(world.get_actor(self.user_a))

    def test_socket_hello_filters_same_level(self) -> None:
        client_a = app_module.socketio.test_client(app_module.app)
        client_a.emit(
            "auth_resume",
            {"token": self.token_a, "scope": "backrooms", "clientDevice": "desktop"},
        )
        self.assertTrue(any(p["name"] == "auth_ok" for p in client_a.get_received()))
        client_a.emit("game_hello", {"levelKey": "clip", "x": 198, "z": 18})
        hello_ok = [p for p in client_a.get_received() if p["name"] == "game_hello_ok"]
        self.assertTrue(hello_ok)
        you = hello_ok[0]["args"][0]["you"]
        self.assertEqual(you["levelKey"], "clip")
        self.assertGreater(you["protectLeft"], 100)
        client_a.disconnect()

    def test_l1_return_protect_is_15s(self) -> None:
        first = self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        self.assertGreater(first["you"]["protectLeft"], 100)
        self.assertEqual(first["you"]["protectKind"], "first")
        world.hello(
            "sa",
            {"user_id": self.user_a, "nickname": "甲", "scope": "backrooms"},
            {"levelKey": "l4", "x": 0, "z": 0, "yaw": 0},
        )
        again = world.hello(
            "sa",
            {"user_id": self.user_a, "nickname": "甲", "scope": "backrooms"},
            {"levelKey": "clip", "x": 198, "z": 18, "yaw": 0},
        )
        left = again["you"]["protectLeft"]
        self.assertGreater(left, 10)
        self.assertLessEqual(left, 15.05)
        self.assertEqual(again["you"]["protectKind"], "return")

    def test_non_finite_network_values_are_rejected(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 10, 20)
        a = world.get_actor(self.user_a)
        original = (a["x"], a["z"], a["yaw"])
        world.apply_input(
            "sa",
            {"x": float("nan"), "z": float("inf"), "yaw": float("-inf")},
        )
        self.assertEqual((a["x"], a["z"], a["yaw"]), original)
        before_ammo = world._inventory_count(a, "fire_salt")
        result = world.weapon_fire(
            "sa",
            {
                "weapon": "fire_salt",
                "explodeX": float("inf"),
                "explodeZ": 20,
            },
        )
        self.assertEqual(result["reason"], "aim")
        self.assertEqual(world._inventory_count(a, "fire_salt"), before_ammo)

    def test_l1_spawn_slots_are_stable_and_separate(self) -> None:
        self._hello(self.user_a, "sa", "甲", "clip", 198, 18)
        self._hello(self.user_b, "sb", "乙", "clip", 198, 18)
        a = world.get_actor(self.user_a)
        b = world.get_actor(self.user_b)
        self.assertEqual((a["x"], a["z"]), world._meg_spawn_for(self.user_a))
        self.assertEqual((b["x"], b["z"]), world._meg_spawn_for(self.user_b))
        self.assertNotEqual((a["x"], a["z"]), (b["x"], b["z"]))
        self.assertTrue(world.is_in_meg_base(a["x"], a["z"]))
        self.assertTrue(world.is_in_meg_base(b["x"], b["z"]))

    def test_pickup_packets_are_rate_limited(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        for i in range(world.PICKUP_BURST_LIMIT):
            result = world.claim_pickup(
                "sa",
                {"key": f"l4:test:pickup:{i}", "itemId": "fire_salt"},
            )
            self.assertTrue(result["ok"])
        limited = world.claim_pickup(
            "sa", {"key": "l4:test:pickup:overflow", "itemId": "fire_salt"}
        )
        self.assertEqual(limited["reason"], "rate")
        self.assertEqual(limited["itemId"], "fire_salt")

    def test_retired_items_are_removed_and_cannot_be_claimed(self) -> None:
        db.save_backrooms_world_actor(
            self.user_a,
            {
                "levelKey": "l4",
                "x": 0,
                "z": 0,
                "hp": 100,
                "inventory": [
                    {"id": "bandage", "name": "绷带"},
                    {"id": "industrial_supplies", "name": "工具包"},
                    {"id": "almond_water", "name": "杏仁水"},
                ],
            },
        )
        result = self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        self.assertEqual(
            world.get_actor(self.user_a)["inventory"],
            [{"id": "almond_water", "name": "杏仁水"}],
        )
        rejected = world.claim_pickup(
            "sa", {"key": "l4:test:retired", "itemId": "bandage", "name": "绷带"}
        )
        self.assertEqual(rejected["reason"], "invalid")
        self.assertEqual(result["you"]["levelKey"], "l4")

    def test_world_loop_step_survives_one_bad_frame(self) -> None:
        with (
            patch.object(world, "tick", side_effect=RuntimeError("boom")),
            self.assertLogs(app_module.app.logger, level="ERROR"),
        ):
            self.assertEqual(app_module._world_loop_step(0.05), -1.0)

    def test_hello_inventory_is_ignored(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        world.hello(
            "sa",
            self._sess(self.user_a, "甲"),
            {
                "levelKey": "l4",
                "x": 0,
                "z": 0,
                "inventory": [{"id": "fire_salt", "name": "火盐"}] * 4,
            },
        )
        self.assertEqual(world.get_actor(self.user_a)["inventory"], [])
        self.assertNotEqual(world.get_actor(self.user_a)["level_key"], world.DETENTION_LEVEL)

    def test_inventory_dump_is_ignored_to_avoid_old_client_false_positive(self) -> None:
        ip = "203.0.113.10"
        db.update_user_last_ip(self.user_a, ip)
        db.update_user_last_ip(self.user_b, ip)
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        dumped = world.hello(
            "sa",
            self._sess(self.user_a, "甲", ip),
            {
                "levelKey": "l4",
                "x": 0,
                "z": 0,
                "inventory": [{"id": "fire_salt", "name": "火盐"}] * 12,
            },
        )
        self.assertEqual(world.get_actor(self.user_a)["level_key"], "l4")
        self.assertIsNone(dumped["you"]["detention"])
        self.assertEqual(world.get_actor(self.user_a)["inventory"], [])

    def test_three_distinct_forged_pickups_detain_ip_accounts(self) -> None:
        ip = "203.0.113.10"
        db.update_user_last_ip(self.user_a, ip)
        db.update_user_last_ip(self.user_b, ip)
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        first = world.claim_pickup(
            "sa", {"key": "hack:forged:1", "itemId": "fire_salt"}
        )
        second = world.claim_pickup(
            "sa", {"key": "hack:forged:2", "itemId": "fire_salt"}
        )
        self.assertEqual(first["warningCount"], 1)
        self.assertEqual(second["warningCount"], 2)
        self.assertEqual(world.get_actor(self.user_a)["level_key"], "l4")
        result = world.claim_pickup(
            "sa", {"key": "hack:forged:3", "itemId": "fire_salt"}
        )
        self.assertEqual(world.get_actor(self.user_a)["level_key"], "l363")
        self.assertEqual(result["detention"]["reason"], "pickup")
        saved_b = db.load_backrooms_world_actor(self.user_b)
        self.assertEqual(saved_b["levelKey"], "l363")

    def test_repeated_identical_bad_pickup_does_not_detain(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        for _ in range(3):
            result = world.claim_pickup(
                "sa", {"key": "hack:same:key", "itemId": "fire_salt"}
            )
        self.assertEqual(result["warningCount"], 1)
        self.assertEqual(world.get_actor(self.user_a)["level_key"], "l4")

    def test_hello_teleport_is_corrected_without_detention(self) -> None:
        self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
        world.hello(
            "sa",
            self._sess(self.user_a, "甲"),
            {"levelKey": "l4", "x": 400, "z": 400},
        )
        actor = world.get_actor(self.user_a)
        self.assertEqual(actor["level_key"], "l4")
        self.assertEqual((actor["x"], actor["z"]), (0, 0))
        self.assertIsNone(db.get_active_backrooms_detention("203.0.113.10"))

    def test_repeat_ip_strike_lengthens_detention(self) -> None:
        self.assertEqual(world.detention_seconds(2.0, 1), 600 * 2 * (3 ** 4))
        self.assertEqual(world.detention_seconds(2.0, 2), 600 * 2 * (3 ** 5))
        self.assertEqual(world.detention_seconds(1.5, 1), int(600 * 1.5 * (3 ** 4)))
        self.assertEqual(world.detention_seconds(2.0, 12), world.CHEAT_MAX_SEC)
        world.CHEAT_STRIKE_COOLDOWN = 0
        try:
            self._hello(self.user_a, "sa", "甲", "l4", 0, 0)
            first = world.flag_cheat(world.get_actor(self.user_a), "pickup", self._sess(self.user_a, "甲"))
            second = world.flag_cheat(world.get_actor(self.user_a), "pickup", self._sess(self.user_a, "甲"))
            self.assertEqual(first["detention"]["strikeCount"], 1)
            self.assertEqual(second["detention"]["strikeCount"], 2)
            self.assertGreater(second["detention"]["leftSec"], first["detention"]["leftSec"])
        finally:
            world.CHEAT_STRIKE_COOLDOWN = 8.0


if __name__ == "__main__":
    unittest.main()
