"""端到端校验：客户端锁定逻辑与真实服务端 /api/backrooms 契约一致。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as app_module  # noqa: E402
import db  # noqa: E402


class MegLockLiveTest(unittest.TestCase):
    """用真实 Flask 测试客户端验证客户端模块使用的路由与字段。"""

    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_db_path = db.DB_PATH
        db.DB_PATH = Path(self.tempdir.name) / "test.db"
        db.init_db()
        app_module.app.config.update(TESTING=True, ADMIN_ONLY=False)
        self.client = app_module.app.test_client()

    def tearDown(self) -> None:
        db.DB_PATH = self.old_db_path
        self.tempdir.cleanup()

    def test_status_reports_local_career_disabled(self) -> None:
        body = self.client.get("/api/backrooms/status").get_json()
        self.assertTrue(body["megOnline"])
        self.assertFalse(body["locked"])
        self.assertFalse(body["localCareerAvailable"])

    def test_client_flow_routes_exist_and_dedupe(self) -> None:
        created = self.client.post(
            "/api/backrooms/identity", json={"displayName": "测试流浪者"}
        )
        self.assertEqual(created.status_code, 201)
        token = created.get_json()["token"]
        headers = {"Authorization": "Bearer " + token}

        restored = self.client.post("/api/backrooms/identity", json={}, headers=headers)
        self.assertTrue(restored.get_json()["restored"])

        event = {
            "eventId": "live:task:1",
            "type": "task_complete",
            "levelId": "l1",
            "payload": {"taskId": "package_l1"},
        }
        first = self.client.post("/api/backrooms/event", json=event, headers=headers).get_json()
        self.assertTrue(first["ok"])
        self.assertGreater(first["profile"]["contribution"], 0)

        again = self.client.post("/api/backrooms/event", json=event, headers=headers).get_json()
        self.assertTrue(again["duplicate"])
        self.assertEqual(again["profile"]["contribution"], first["profile"]["contribution"])

    def test_invalid_token_is_rejected(self) -> None:
        res = self.client.post(
            "/api/backrooms/identity", json={}, headers={"Authorization": "Bearer nope"}
        )
        self.assertEqual(res.status_code, 401)
        self.assertFalse(res.get_json()["ok"])


if __name__ == "__main__":
    unittest.main()
