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
        self.assertIn("js/vendor/three.module.min.js", files)
        self.assertIn("backrooms-level1.html", files)
        self.assertNotIn("backrooms-sandbox.html", files)
        self.assertNotIn("models/pirate-chest.glb", files)
        self.assertTrue(len(files) > 80)


if __name__ == "__main__":
    unittest.main()
