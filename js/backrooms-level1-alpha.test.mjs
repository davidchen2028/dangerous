import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MEG_RANKS } from "./backrooms-meg-career.js";
import { BASE_STORAGE_CAPACITY, BASE_STORAGE_KEY } from "./backrooms-base-storage.js";
import {
  ALPHA_CELLAR_Y,
  ALPHA_CORRIDOR_LEN,
  ALPHA_LOCKED_NOTE,
  ALPHA_OFFICE_LOCK_NOTE,
  ALPHA_OFFICE_RANKS,
  ALPHA_SIGN,
  ALPHA_ZEPHYR_NOTE,
  canEnterMegOffice,
  getAlphaFloorY,
  getAlphaLayout,
  getZephyrBarricade,
  hitsAlphaSolid,
  hitsZephyrBarricade,
  isInsideAlphaCellar,
  isInsideAlphaComplex,
  isInsideAlphaExplore,
  isInsideAlphaLobby,
  isInsideAlphaOffice,
  isOnAlphaStairs,
  listAlphaClearBounds,
  listAlphaWalkPath,
  stickAlphaRampY,
} from "./backrooms-level1-alpha-layout.js";
import { getMegRankIndex } from "./backrooms-meg-career.js";

const ROOT = resolve(import.meta.dirname, "..");
const CENTER = { x: 0, z: 0 };

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

test("Alpha office door uses existing officer+ ranks and blocks locked or suspended files", () => {
  assert.deepEqual(ALPHA_OFFICE_RANKS, ["officer", "clearance", "supervisor"]);
  assert.equal(canEnterMegOffice({ rank: "officer", online: true, locked: false }), true);
  assert.equal(canEnterMegOffice({ rank: "clearance", online: true }), true);
  assert.equal(canEnterMegOffice({ rank: "supervisor", online: true }), true);
  assert.equal(canEnterMegOffice({ rank: "lead", online: true }), false);
  assert.equal(canEnterMegOffice({ rank: "member", online: true }), false);
  assert.equal(canEnterMegOffice({ rank: "officer", online: true, locked: true }), false);
  assert.equal(canEnterMegOffice({ rank: "officer", online: false }), false);
  assert.equal(
    canEnterMegOffice({ rank: "supervisor", online: true, authorityActive: false }),
    false
  );
  assert.equal(getMegRankIndex("officer") >= getMegRankIndex("officer"), true);
  assert.equal(getMegRankIndex("lead") >= getMegRankIndex("officer"), false);
});

test("Alpha exploration room is walkable and locked wings plus office door stay solid", () => {
  const path = listAlphaWalkPath(CENTER);
  assert.equal(hitsAlphaSolid(path.exploreDoor.x, path.exploreDoor.z, CENTER), false);
  assert.equal(hitsAlphaSolid(path.exploreIn.x, path.exploreIn.z, CENTER), false);
  assert.equal(isInsideAlphaExplore(path.exploreIn.x, path.exploreIn.z, CENTER), true);
  assert.equal(hitsAlphaSolid(path.lockedDoor.x, path.lockedDoor.z, CENTER), true);
  assert.equal(hitsAlphaSolid(path.officeDoor.x, path.officeDoor.z, CENTER), true);
  assert.equal(
    hitsAlphaSolid(path.officeDoor.x, path.officeDoor.z, CENTER, { officeOpen: true }),
    false
  );
});

test("Alpha office stairs stay walkable and do not drop into the void", () => {
  const path = listAlphaWalkPath(CENTER);
  assert.equal(hitsAlphaSolid(path.officeIn.x, path.officeIn.z, CENTER, { officeOpen: true }), false);
  assert.equal(isInsideAlphaOffice(path.officeIn.x, path.officeIn.z, CENTER), true);
  for (const step of path.stairs) {
    assert.equal(
      hitsAlphaSolid(step.x, step.z, CENTER, { officeOpen: true }),
      false,
      "stair " + step.z
    );
    assert.equal(
      isOnAlphaStairs(step.x, step.z, CENTER) ||
        isInsideAlphaOffice(step.x, step.z, CENTER) ||
        isInsideAlphaCellar(step.x, step.z, CENTER),
      true
    );
  }
  assert.equal(hitsAlphaSolid(path.stairOff.x, path.stairOff.z, CENTER), true);
  assert.equal(hitsAlphaSolid(path.cellarIn.x, path.cellarIn.z, CENTER), false);
  assert.equal(isInsideAlphaCellar(path.cellarIn.x, path.cellarIn.z, CENTER), true);
  assert.equal(getAlphaFloorY(path.officeIn.x, path.officeIn.z, CENTER), 0);
  assert.equal(getAlphaFloorY(path.cellarIn.x, path.cellarIn.z, CENTER), ALPHA_CELLAR_Y);
  assert.ok(getAlphaFloorY(path.stairs[2].x, path.stairs[2].z, CENTER) < -0.5);
  const L = getAlphaLayout(CENTER);
  const stairX = (L.stairs.minX + L.stairs.maxX) * 0.5;
  assert.equal(getAlphaFloorY(stairX, L.stairs.maxZ, CENTER), ALPHA_CELLAR_Y);
  assert.equal(getAlphaFloorY(stairX, L.cellar.minZ, CENTER), ALPHA_CELLAR_Y);
  assert.equal(getAlphaFloorY(stairX, L.stairs.minZ, CENTER), 0);
  const midFloor = getAlphaFloorY(path.stairs[2].x, path.stairs[2].z, CENTER);
  assert.equal(
    stickAlphaRampY(midFloor + 0.2, 0, path.stairs[2].x, path.stairs[2].z, CENTER),
    midFloor
  );
  assert.equal(
    stickAlphaRampY(midFloor + 0.2, 4, path.stairs[2].x, path.stairs[2].z, CENTER),
    midFloor + 0.2
  );
  assert.equal(stickAlphaRampY(0, 0, path.officeIn.x, path.officeIn.z, CENTER), 0);
});

test("Zephyr barricade blocks the east-corridor void and lobby respawn stays in the hall", () => {
  const z = getZephyrBarricade(CENTER);
  assert.equal(z.endX - z.startX, ALPHA_CORRIDOR_LEN);
  assert.equal(hitsZephyrBarricade(z.walkX, z.walkZ, CENTER), false);
  assert.equal(hitsZephyrBarricade(z.endX - 0.4, z.walkZ, CENTER), true);
  assert.ok(z.voidX > z.endX);
  const L = getAlphaLayout(CENTER);
  const officeMid = {
    x: (L.office.minX + L.office.maxX) * 0.5,
    z: (L.office.minZ + L.office.maxZ) * 0.5,
  };
  assert.equal(isInsideAlphaLobby(officeMid.x, officeMid.z, CENTER), false);
  assert.equal(isInsideAlphaComplex(officeMid.x, officeMid.z, CENTER), true);
  assert.equal(isInsideAlphaLobby(0, 0, CENTER), true);
  assert.equal(isInsideAlphaLobby(0, 4.2, CENTER), false);
  assert.equal(isInsideAlphaComplex(0, 4.2, CENTER), true);
  assert.equal(isInsideAlphaComplex(L.wings[0].x, L.northZ, CENTER), true);
  assert.equal(isInsideAlphaComplex(L.wings[1].x, L.northZ + 0.35, CENTER), false);
  const grown = listAlphaClearBounds(CENTER);
  assert.ok(
    grown.some(function (b) {
      return b.minX <= L.cellar.minX - 2 && b.maxZ >= L.cellar.maxZ + 2;
    })
  );
});

test("Alpha wiring keeps career table, L4 volunteer desk, and 100-slot storage", () => {
  const world = read("js/backrooms-level1-world.js");
  const src = read("js/backrooms-level1.js");
  const html = read("backrooms-level1.html");
  const career = read("js/backrooms-meg-career.js");
  const l4 = read("js/backrooms-level4.js");
  assert.match(world, /M\.E\.G\. Base Alpha|ALPHA_SIGN/);
  assert.match(world, /meg_wing_door/);
  assert.match(world, /meg_office_door/);
  assert.match(world, /meg_explore_briefing/);
  assert.match(world, /meg_zephyr_barricade/);
  assert.match(world, /kind: "meg_zephyr_barricade",\s*minX: zephyr\.minX/);
  assert.match(world, /西风区扩建中|ALPHA_ZEPHYR_NOTE/);
  assert.match(src, /getMegRankIndex/);
  assert.match(src, /openTaskBoard/);
  assert.match(src, /sitOfficeChair/);
  assert.match(src, /openMegCareerStorage/);
  assert.match(src, /资质认证：选定四职之一/);
  assert.match(src, /isTaskUiOpen\(\)/);
  assert.match(src, /tapInteractId/);
  assert.match(src, /tryMegQAction/);
  assert.match(src, /AIM_INTERACT_MAX = 5\.2/);
  assert.match(src, /function respawnAtMegBase\([\s\S]*officeSitting = false/);
  assert.match(src, /stickAlphaRampY/);
  assert.match(src, /updateMatrixWorld[\s\S]*getCameraAimRay/);
  assert.match(world, /本职告示/);
  assert.match(world, /职级铭牌/);
  assert.match(world, /plateZ/);
  assert.match(world, /cellarSouthW/);
  assert.match(world, /chunkHasBelowGradeCut/);
  assert.match(world, /cellOverlapsAlphaBelowGrade/);
  assert.match(world, /reloadBelowGradeChunks/);
  assert.match(world, /sharedCellPlaneGeo/);
  assert.match(src, /aimMinY/);
  assert.match(html, /backrooms-level1\.js\?v=129/);
  assert.deepEqual([...MEG_RANKS], [
    "none",
    "volunteer",
    "trainee",
    "member",
    "senior",
    "lead",
    "officer",
    "clearance",
    "supervisor",
  ]);
  assert.match(career, /volunteer: \["report", "tasks"\]/);
  assert.match(l4, /本前哨只能办理志愿者登记和资深队员确认/);
  assert.equal(BASE_STORAGE_CAPACITY, 100);
  assert.equal(BASE_STORAGE_KEY, "backrooms_base_storage_v1");
  assert.doesNotMatch(src, /backrooms_alpha_/);
  assert.doesNotMatch(world, /MEG_RANKS\s*=/);
  assert.equal(ALPHA_SIGN, "M.E.G. Base Alpha");
  assert.equal(ALPHA_LOCKED_NOTE, "须联络 Omega / 未对你的职级开放");
  assert.equal(ALPHA_OFFICE_LOCK_NOTE, "权限不足。晋升后回行政署报到。");
  assert.equal(ALPHA_ZEPHYR_NOTE, "西风区扩建中");
});
