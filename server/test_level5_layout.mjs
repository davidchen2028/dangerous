import assert from "node:assert/strict";
import {
  getLevel5ChunkLayout,
  getLevel5Zone,
  level5WorldToChunk,
  validateLevel5Layout,
} from "../js/backrooms-level5-layout.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}

check("same seed and coordinates are deterministic", () => {
  assert.deepEqual(
    getLevel5ChunkLayout("hotel-a", -3, 7),
    getLevel5ChunkLayout("hotel-a", -3, 7)
  );
});

check("all neighboring ports match", () => {
  assert.deepEqual(validateLevel5Layout("hotel-a", 20), []);
});

check("spawn chunk is the safe lobby", () => {
  var spawn = getLevel5ChunkLayout("hotel-a", 0, 0);
  assert.equal(spawn.zone, "lobby");
  assert.equal(spawn.entities.length, 0);
  assert.equal(spawn.exit, "l4");
});

check("grand hall and boiler zones are reachable by straight Euclidean travel", () => {
  assert.equal(getLevel5Zone(-4, 0), "grand_hall");
  assert.equal(getLevel5Zone(1, 12), "grand_hall");
  assert.equal(getLevel5Zone(2, 0), "boiler");
  assert.equal(getLevel5ChunkLayout("hotel-a", 4, 0).exit, "l6");
});

check("world coordinates map consistently to chunks", () => {
  assert.deepEqual(level5WorldToChunk(0, 0), { cx: 0, cz: 0 });
  assert.deepEqual(level5WorldToChunk(24, -24), { cx: 1, cz: -1 });
});

check("generated danger descriptors stay out of lobby", () => {
  for (let z = -10; z <= 10; z++) {
    for (let x = -10; x <= 10; x++) {
      var chunk = getLevel5ChunkLayout("hotel-a", x, z);
      if (chunk.zone === "lobby") assert.equal(chunk.entities.length, 0);
    }
  }
});

check("loot and records avoid furniture footprints", () => {
  assert.deepEqual(validateLevel5Layout("terror-hotel", 12), []);
});

console.log("Level5 layout tests: " + passed + " passed, 0 failed");
