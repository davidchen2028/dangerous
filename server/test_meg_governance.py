from __future__ import annotations

import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as server_app
import db


class MegGovernanceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_db_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "test.db"
        db.init_db()
        server_app.app.config.update(TESTING=True, ADMIN_ONLY=False)
        server_app.ADMIN_KEY = "test-admin-key"
        self.client = server_app.app.test_client()

    def tearDown(self) -> None:
        db.DB_PATH = self.old_db_path
        self.tempdir.cleanup()

    def create_identity(self, name: str) -> tuple[str, int]:
        response = self.client.post(
            "/api/backrooms/identity", json={"displayName": name}
        )
        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        return body["token"], int(body["profile"]["identityId"])

    def qualify_for_supervisor(self, identity_id: int) -> None:
        sequence = 0

        def event(kind: str, level: str | None = None, payload: dict | None = None) -> None:
            nonlocal sequence
            sequence += 1
            ok, duplicate = db.record_backrooms_event(
                identity_id, f"{identity_id}-{sequence}", kind, level, payload or {}
            )
            self.assertTrue(ok)
            self.assertFalse(duplicate)

        task_ids = list(db.MEG_TASK_IDS)
        for i in range(60):
            event("task_complete", payload={"taskId": task_ids[i % len(task_ids)]})
        for i in range(10):
            event("level_enter", f"Level-{i}")
        for i, task_id in enumerate(sorted(db.MEG_HIGH_RISK_TASK_IDS)[:3]):
            event("high_risk_complete", payload={"taskId": task_id})
        db.set_meg_department(identity_id, "explore")

    def queue_supervisor(self, identity_id: int) -> int:
        self.qualify_for_supervisor(identity_id)
        for expected in db.MEG_RANKS[1:8]:
            ok, message, _ = db.apply_meg_promotion(identity_id)
            self.assertTrue(ok, message)
            self.assertEqual(db.get_meg_profile(identity_id)["rank"], expected)
        for archive_id in ("A", "B", "E", "F"):
            ok, duplicate = db.record_backrooms_event(
                identity_id,
                f"{identity_id}-archive-{archive_id}",
                "c101_archive",
                "c101",
                {"archiveId": archive_id},
            )
            self.assertTrue(ok)
            self.assertFalse(duplicate)
        ok, message, application_id = db.apply_meg_promotion(identity_id)
        self.assertTrue(ok, message)
        self.assertEqual(db.get_meg_profile(identity_id)["rank"], "clearance")
        self.assertIsNotNone(application_id)
        return int(application_id)

    def test_migration_identity_restore_rank_order_and_event_dedup(self) -> None:
        db.init_db()  # idempotent migration
        with db.connect() as conn:
            names = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
        self.assertIn("backrooms_identities", names)
        self.assertIn("meg_audit_log", names)

        token, identity_id = self.create_identity("迁移测试员")
        accepted, _ = db.record_backrooms_event(
            identity_id, "early-archive", "c101_archive", "c101", {"archiveId": "A"}
        )
        self.assertFalse(accepted)
        with db.connect() as conn:
            stored = conn.execute(
                "SELECT token_hash FROM backrooms_identities WHERE id=?", (identity_id,)
            ).fetchone()["token_hash"]
        self.assertNotEqual(stored, token)
        self.assertEqual(len(stored), 64)

        restored = self.client.post(
            "/api/backrooms/identity",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.get_json()["restored"])

        first = self.client.post(
            "/api/backrooms/event",
            json={"token": token, "eventId": "dedup-1", "type": "task_complete",
                  "payload": {"taskId": "package_l1"}},
        )
        second = self.client.post(
            "/api/backrooms/event",
            json={"token": token, "eventId": "dedup-1", "type": "task_complete",
                  "payload": {"taskId": "package_l1"}},
        )
        self.assertFalse(first.get_json()["duplicate"])
        self.assertTrue(second.get_json()["duplicate"])
        self.assertEqual(second.get_json()["profile"]["contribution"], 25)

        application_id = self.queue_supervisor(identity_id)
        profile = db.get_meg_profile(identity_id)
        self.assertEqual(profile["pendingPromotion"]["id"], application_id)
        self.assertEqual(profile["rank"], "clearance")  # never auto-approved
        ok, message = db.review_supervisor_application(
            application_id, False, 3, note="资格复核未通过"
        )
        self.assertTrue(ok, message)
        ok, message, _ = db.apply_meg_promotion(identity_id)
        self.assertFalse(ok)
        self.assertIn("冷却", message)
        accepted, _ = db.record_backrooms_event(
            identity_id, "clearance-submit", "c101_submit", "c101", {}
        )
        self.assertFalse(accepted)

    def test_civilian_assault_penalty_is_allowed_and_deduplicated(self) -> None:
        _, identity_id = self.create_identity("流浪者纪律测试")
        accepted, duplicate = db.record_backrooms_event(
            identity_id,
            "civilian-assault:l2:l2-ordinary:first-hit",
            "civilian_assault",
            "l2",
            {"wandererId": "l2-ordinary", "source": "wanderer_ecosystem"},
        )
        self.assertTrue(accepted)
        self.assertFalse(duplicate)
        accepted, duplicate = db.record_backrooms_event(
            identity_id,
            "civilian-assault:l2:l2-ordinary:first-hit",
            "civilian_assault",
            "l2",
            {"wandererId": "l2-ordinary", "source": "wanderer_ecosystem"},
        )
        self.assertTrue(accepted)
        self.assertTrue(duplicate)
        self.assertEqual(db.get_meg_profile(identity_id)["contribution"], 0)

    def test_supervisor_e_number_cap_archive_and_admin_case(self) -> None:
        _, first_id = self.create_identity("监督候选一")
        _, second_id = self.create_identity("监督候选二")
        _, third_id = self.create_identity("监督候选三")
        first_app = self.queue_supervisor(first_id)
        second_app = self.queue_supervisor(second_id)
        third_app = self.queue_supervisor(third_id)

        ok, message = db.review_supervisor_application(first_app, True, 2)
        self.assertTrue(ok, message)
        self.assertEqual(db.get_meg_profile(first_id)["supervisorCode"], "E")
        ok, message = db.review_supervisor_application(second_app, True, 2)
        self.assertTrue(ok, message)
        self.assertEqual(db.get_meg_profile(second_id)["supervisorCode"], "F")
        ok, _ = db.review_supervisor_application(third_app, True, 2)
        self.assertFalse(ok)

        _, reporter_id = self.create_identity("审查举报员")
        db.record_backrooms_event(
            reporter_id, "reporter-task", "task_complete", "l4",
            {"taskId": "package_l1"},
        )
        db.record_backrooms_event(reporter_id, "reporter-level", "level_enter", "l4", {})
        ok, message, _ = db.apply_meg_promotion(reporter_id)
        self.assertTrue(ok, message)
        report_id, recommendation, requires_admin = db.create_meg_report(
            reporter_id,
            first_id,
            "监督者滥权并泄密",
            "请求管理员审查",
            [{"content": "文字陈述"}],
        )
        self.assertEqual(recommendation, "revoke_supervisor")
        self.assertTrue(requires_admin)
        self.assertFalse(db.get_meg_profile(first_id)["highRiskAuthorityEffective"])
        case = db.list_meg_cases(reporter_id)[0]
        self.assertFalse(case["evidence"][0]["serverValidated"])

        ok, message = db.review_meg_case(
            report_id, "sanction", "revoke_supervisor", "证据成立"
        )
        self.assertTrue(ok, message)
        with db.connect() as conn:
            slot_e = conn.execute(
                "SELECT status FROM meg_supervisor_slots WHERE code='E'"
            ).fetchone()
        self.assertEqual(slot_e["status"], "archived")

        ok, message = db.review_supervisor_application(third_app, True, 2)
        self.assertTrue(ok, message)
        self.assertEqual(db.get_meg_profile(third_id)["supervisorCode"], "G")
        overview = self.client.get(
            "/api/admin/backrooms/overview?key=test-admin-key"
        )
        self.assertEqual(overview.status_code, 200)
        self.assertGreaterEqual(len(overview.get_json()["audit"]), 4)

    def test_clearance_reviews_only_ordinary_cases(self) -> None:
        _, reviewer_id = self.create_identity("数据库审查员")
        self.queue_supervisor(reviewer_id)  # remains clearance until owner approval
        _, reporter_id = self.create_identity("普通举报员")
        _, target_id = self.create_identity("普通被举报员")
        with db.connect() as conn:
            conn.execute(
                "UPDATE meg_profiles SET rank='volunteer' WHERE identity_id IN (?,?)",
                (reporter_id, target_id),
            )
        report_id, _, requires_admin = db.create_meg_report(
            reporter_id, target_id, "task_sabotage", "故意丢弃任务设备", []
        )
        self.assertFalse(requires_admin)
        reviewable = db.list_reviewable_meg_cases(reviewer_id)
        self.assertEqual([item["id"] for item in reviewable], [report_id])
        ok, message = db.review_meg_case_as_player(
            reviewer_id, report_id, "sanction", "warning", "服务端任务记录成立"
        )
        self.assertTrue(ok, message)
        overview = db.get_meg_overview(3)
        sanction_id = int(overview["activeSanctions"][0]["id"])
        ok, message = db.lift_meg_sanction(sanction_id)
        self.assertTrue(ok, message)
        self.assertFalse(db.get_meg_overview(3)["activeSanctions"])

    def test_http_volunteer_medical_gate(self) -> None:
        token, _ = self.create_identity("入职体检员")
        headers = {"Authorization": f"Bearer {token}"}
        self.client.post(
            "/api/backrooms/event",
            headers=headers,
            json={
                "eventId": "medical-task",
                "type": "task_complete",
                "payload": {"taskId": "package_l1"},
            },
        )
        self.client.post(
            "/api/backrooms/event",
            headers=headers,
            json={"eventId": "medical-level", "type": "level_enter", "levelId": "l4"},
        )
        failed = self.client.post("/api/backrooms/promotion/apply", headers=headers, json={})
        self.assertEqual(failed.status_code, 409)
        passed = self.client.post(
            "/api/backrooms/promotion/apply",
            headers=headers,
            json={"vitals": {"hp": 90, "sanity": 90, "dead": False}},
        )
        self.assertEqual(passed.status_code, 200)
        self.assertEqual(passed.get_json()["profile"]["rank"], "volunteer")

    def test_meg_status_is_unlocked(self) -> None:
        status = self.client.get("/api/backrooms/status")
        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.get_json()["locked"])
        self.assertFalse(status.get_json()["localCareerAvailable"])


if __name__ == "__main__":
    unittest.main()
