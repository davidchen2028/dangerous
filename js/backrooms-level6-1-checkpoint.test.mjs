import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "backrooms-level6-1.js"), "utf8");

test("Level 6.1 M.E.G. checkpoint uses numeric 6.1, not integer 6 or string", () => {
  assert.match(source, /installMegCheckpointDeathHooks\(\s*survival,\s*function\s*\(\)\s*\{\s*return\s*\{\s*level:\s*6\.1\s*\};/);
  assert.doesNotMatch(
    source,
    /installMegCheckpointDeathHooks\(\s*survival,\s*function\s*\(\)\s*\{\s*return\s*\{\s*level:\s*6\s*\};/
  );
  assert.doesNotMatch(source, /return\s*\{\s*level:\s*["']6\.1["']\s*\}/);
});
