"""后室 Socket 在线计时与关卡跳转续接测试。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as app_module  # noqa: E402
import db  # noqa: E402


class BackroomsPresenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_db_path = db.DB_PATH
        self.old_grace = app_module.BACKROOMS_PRESENCE_GRACE_SECONDS
        db.DB_PATH = Path(self.tempdir.name) / "test.db"
        db.init_db()
        app_module.app.config.update(TESTING=True, ADMIN_ONLY=False)
        app_module.BACKROOMS_PRESENCE_GRACE_SECONDS = 5
        app_module.sessions_by_sid.clear()
        app_module.sid_by_user_id.clear()
        app_module.pending_online_session_ends.clear()

        self.user_id = db.create_user("后室计时员", generate_password_hash("secret12"))
        self.token = "presence-test-token"
        db.create_session(self.user_id, self.token)

    def tearDown(self) -> None:
        app_module.sessions_by_sid.clear()
        app_module.sid_by_user_id.clear()
        app_module.pending_online_session_ends.clear()
        db.DB_PATH = self.old_db_path
        app_module.BACKROOMS_PRESENCE_GRACE_SECONDS = self.old_grace
        self.tempdir.cleanup()

    def _connect(self):
        client = app_module.socketio.test_client(app_module.app)
        client.emit(
            "auth_resume",
            {
                "token": self.token,
                "clientDevice": "desktop",
                "scope": "backrooms",
                "page": "/backrooms-level0.html",
            },
        )
        self.assertTrue(
            any(packet["name"] == "auth_ok" for packet in client.get_received())
        )
        return client

    def test_level_navigation_reuses_one_online_session(self) -> None:
        first = self._connect()
        first_session = next(iter(app_module.sessions_by_sid.values()))
        online_session_id = first_session["online_session_id"]
        self.assertEqual(first_session["scope"], "backrooms")

        first.disconnect()
        self.assertIn(self.user_id, app_module.pending_online_session_ends)

        second = self._connect()
        second_session = next(iter(app_module.sessions_by_sid.values()))
        self.assertEqual(second_session["online_session_id"], online_session_id)
        self.assertNotIn(self.user_id, app_module.pending_online_session_ends)

        with db.connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) AS n FROM online_sessions WHERE user_id = ?",
                (self.user_id,),
            ).fetchone()["n"]
        self.assertEqual(count, 1)

        second.emit("auth_logout")
        second.disconnect()


if __name__ == "__main__":
    unittest.main()
