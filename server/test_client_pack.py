import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import client_pack

ROOT = Path(__file__).resolve().parent.parent


class ClientPackTests(unittest.TestCase):
    def test_lists_level_scripts_and_skips_sandbox(self):
        files = client_pack.list_client_pack_files(ROOT)
        self.assertIn("js/backrooms-level1.js", files)
        self.assertIn("js/backrooms-level4-layout.js", files)
        self.assertIn("js/backrooms-level4-entities.js", files)
        self.assertIn("js/backrooms-multiplayer.js", files)
        self.assertIn("js/mobile-landscape-guard.js", files)
        self.assertIn("css/mobile-landscape-guard.css", files)
        self.assertIn("js/client-device.js", files)
        self.assertIn("js/backrooms-remote-players.js", files)
        self.assertIn("js/backrooms-entity81.js", files)
        self.assertIn("js/backrooms-entity81-catalog.js", files)
        self.assertIn("backrooms-entity81.html", files)
        self.assertIn("js/vendor/three.module.min.js", files)
        self.assertIn("backrooms-level1.html", files)
        self.assertIn("backrooms-level6.html", files)
        self.assertNotIn("backrooms-sandbox.html", files)
        self.assertNotIn("models/pirate-chest.glb", files)
        self.assertTrue(len(files) > 80)

    def test_landscape_guard_is_loaded_by_both_lobbies(self):
        guard = (ROOT / "js" / "mobile-landscape-guard.js").read_text(encoding="utf-8")
        self.assertNotIn("export ", guard)
        self.assertIn("iPhone", guard)
        self.assertIn("iPad", guard)
        self.assertIn("暂不支持手机", guard)
        self.assertIn("请用浏览器打开", guard)
        self.assertIn("在 Safari 中打开", guard)
        self.assertIn("intent://", guard)
        self.assertIn("innerHeight", guard)
        for page in ("index.html", "backrooms-index.html"):
            html = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn('href="css/mobile-landscape-guard.css?v=6"', html, page)
            self.assertIn('src="js/mobile-landscape-guard.js?v=6"', html, page)
            self.assertNotIn(
                'type="module" src="js/mobile-landscape-guard.js',
                html,
                page,
            )
            self.assertIn("phone-unsupported", html, page)
            self.assertIn("暂不支持手机", html, page)
            self.assertIn("tabletBrowserGate", html, page)
            self.assertIn("请用浏览器打开", html, page)
            self.assertIn("在 Safari 中打开", html, page)

    def test_pack_version_is_positive_int(self):
        self.assertIsInstance(client_pack.CLIENT_PACK_VERSION, int)
        self.assertGreaterEqual(client_pack.CLIENT_PACK_VERSION, 14)


if __name__ == "__main__":
    unittest.main()
