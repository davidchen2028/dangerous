import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MEG_RANKS } from "./backrooms-meg-career.js";
import { BASE_STORAGE_CAPACITY, BASE_STORAGE_KEY } from "./backrooms-base-storage.js";
import {
  ALPHA_CELLAR_Y,
  ALPHA_CORRIDOR_LEN,
  ALPHA_LOBBY,
  ALPHA_PLAN_SCALE,
  ALPHA_LOCKED_NOTE,
  ALPHA_OFFICE_LOCK_NOTE,
  ALPHA_OFFICE_RANKS,
  ALPHA_SIGN,
  ALPHA_ZEPHYR_NOTE,
  canEnterMegOffice,
  getAlphaFloorY,
  getAlphaLayout,
  getHubCorridor,
  getZephyrBarricade,
  hitsAlphaSolid,
  isInsideAlphaCorridor,
  hitsZephyrBarricade,
  isInsideAlphaCellar,
  isInsideAlphaComplex,
  isInsideAlphaExplore,
  isInsideAlphaLobby,
  isInsideAlphaOffice,
  isOnAlphaStairs,
  listAlphaClearBounds,
  listAlphaNorthOpenings,
  listAlphaSolidColliders,
  listAlphaWalkPath,
  stickAlphaRampY,
} from "./backrooms-level1-alpha-layout.js";
import { getMegRankIndex } from "./backrooms-meg-career.js";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";

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
  const exploreLayout = getAlphaLayout(CENTER);
  assert.ok(Math.abs(exploreLayout.wings[0].x - exploreLayout.cells.nw.mx) > 2);
  assert.equal(hitsAlphaSolid(exploreLayout.cells.nw.mx, exploreLayout.cells.n.minZ, CENTER), false);
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
  assert.ok(Math.abs(z.endX - z.startX - ALPHA_CORRIDOR_LEN) < 1e-9);
  assert.equal(hitsZephyrBarricade(z.walkX, z.walkZ, CENTER), false);
  assert.equal(hitsZephyrBarricade(z.endX - 0.4, z.walkZ, CENTER), true);
  assert.ok(z.voidX > z.endX);
  const L = getAlphaLayout(CENTER);
  const officeMid = {
    x: (L.office.minX + L.office.maxX) * 0.5,
    z: (L.office.minZ + L.office.maxZ) * 0.5,
  };
  assert.equal(isInsideAlphaLobby(officeMid.x, officeMid.z, CENTER), true);
  assert.equal(isInsideAlphaOffice(officeMid.x, officeMid.z, CENTER), true);
  assert.equal(isInsideAlphaComplex(officeMid.x, officeMid.z, CENTER), true);
  assert.equal(ALPHA_PLAN_SCALE, 3);
  assert.equal(ALPHA_LOBBY.w * ALPHA_LOBBY.d, 14 * 10 * 9);
  assert.equal(isInsideAlphaLobby(0, 0, CENTER), true);
  const nearNorth = L.lobby.maxZ - 0.5;
  assert.equal(isInsideAlphaLobby(0, nearNorth, CENTER), false);
  assert.equal(isInsideAlphaComplex(0, nearNorth, CENTER), true);
  assert.equal(isInsideAlphaComplex(L.wings[0].x, L.wings[0].z, CENTER), true);
  assert.equal(isInsideAlphaComplex(L.wings[1].x, L.northZ + 0.35, CENTER), false);
  const grown = listAlphaClearBounds(CENTER);
  assert.ok(
    grown.some(function (b) {
      return b.minX <= L.cellar.minX - 2 && b.maxZ >= L.cellar.maxZ + 2;
    })
  );
});

test("Alpha 3x3 opens four side doors and four corner corridors", () => {
  const L = getAlphaLayout(CENTER);
  assert.equal(hitsAlphaSolid(L.doors.front.x, L.doors.front.z, CENTER), false);
  assert.equal(hitsAlphaSolid(L.doors.back.x, L.doors.back.z, CENTER), false);
  assert.equal(hitsAlphaSolid(L.doors.left.x, L.doors.left.z, CENTER), false);
  assert.equal(hitsAlphaSolid(L.doors.right.x, L.doors.right.z, CENTER), false);
  assert.ok(L.doors.front.x < L.center.x);
  assert.ok(L.doors.back.x > L.center.x);
  assert.ok(L.doors.left.z > L.center.z);
  assert.ok(L.doors.right.z < L.center.z);
  assert.equal(isInsideAlphaCorridor(L.corridors.sw.walkX, L.corridors.sw.walkZ, CENTER), "sw");
  assert.equal(isInsideAlphaCorridor(L.corridors.se.walkX, L.corridors.se.walkZ, CENTER), "se");
  assert.equal(isInsideAlphaCorridor(L.corridors.nw.walkX, L.corridors.nw.walkZ, CENTER), "nw");
  assert.equal(isInsideAlphaCorridor(L.corridors.ne.walkX, L.corridors.ne.walkZ, CENTER), "ne");
  const hub = getHubCorridor(CENTER);
  assert.equal(hub.axis, "x");
  assert.equal(hub.sign, 1);
  assert.equal(hitsAlphaSolid(L.cells.c.mx, L.cells.c.mz, CENTER), false);
  assert.equal(hitsAlphaSolid(L.cells.s.mx, L.cells.s.mz, CENTER), false);
  assert.equal(hitsAlphaSolid(L.cells.n.mx, L.cells.c.maxZ, CENTER), false);
  assert.equal(hitsAlphaSolid(L.cells.w.maxX, L.cells.w.mz, CENTER), false);
  assert.equal(hitsAlphaSolid(L.cells.e.mx, L.cells.c.maxZ, CENTER), true);
  assert.equal(
    hitsAlphaSolid(L.cells.e.mx, L.cells.c.maxZ, CENTER, { officeOpen: true }),
    true
  );
  const northOpen = listAlphaNorthOpenings(CENTER);
  assert.equal(northOpen.length, 3);
  assert.ok(
    Math.abs(northOpen[1].maxX - northOpen[1].minX - (L.officeNorthDoor.maxX - L.officeNorthDoor.minX)) < 1e-9
  );
  assert.equal(hitsAlphaSolid(L.officeNorthDoor.x, L.officeNorthDoor.z, CENTER), true);
  assert.equal(
    hitsAlphaSolid(L.officeNorthDoor.x, L.officeNorthDoor.z, CENTER, { officeOpen: true }),
    false
  );
  const stairMidX = (L.stairs.minX + L.stairs.maxX) * 0.5;
  assert.equal(hitsAlphaSolid(stairMidX, L.northZ, CENTER), false);
  assert.equal(isInsideAlphaComplex(stairMidX, L.northZ, CENTER), true);

  function circleWalk(x0, z0, x1, z1, opts) {
    const walls = listAlphaSolidColliders(CENTER, opts);
    let x = x0;
    let z = z0;
    const step = 0.12;
    for (let i = 0; i < 200; i++) {
      const dist = Math.hypot(x1 - x, z1 - z);
      if (dist < 0.6) return true;
      const tx = x + ((x1 - x) / dist) * step;
      const tz = z + ((z1 - z) / dist) * step;
      const out = resolveCircleAgainstColliders(tx, tz, 0.34, walls, 8, 8);
      if (Math.hypot(out.x - x, out.z - z) < 0.008) return false;
      x = out.x;
      z = out.z;
    }
    return Math.hypot(x - x1, z - z1) < 0.6;
  }
  assert.equal(circleWalk(L.cells.n.mx, L.cells.n.mz, L.cells.ne.mx, L.cells.ne.mz), false);
  assert.equal(
    circleWalk(L.cells.n.mx, L.cells.n.mz, L.cells.ne.mx, L.cells.ne.mz, { officeOpen: true }),
    true
  );
  assert.equal(circleWalk(L.cells.sw.mx, L.cells.sw.mz, L.cells.s.mx, L.cells.s.mz), true);
  assert.equal(circleWalk(L.cells.s.mx, L.cells.s.mz, L.cells.se.mx, L.cells.se.mz), true);
  assert.equal(circleWalk(L.cells.w.mx, L.cells.w.mz, L.cells.c.mx, L.cells.c.mz), true);
  assert.equal(circleWalk(L.cells.c.mx, L.cells.c.mz, L.cells.e.mx, L.cells.e.mz), true);
  assert.equal(circleWalk(L.cells.nw.mx, L.cells.nw.mz, L.cells.n.mx, L.cells.n.mz), true);
  assert.equal(circleWalk(L.cells.sw.mx, L.cells.sw.mz, L.cells.w.mx, L.cells.w.mz), true);
  assert.equal(circleWalk(L.cells.s.mx, L.cells.s.mz, L.cells.c.mx, L.cells.c.mz), true);
  assert.equal(circleWalk(L.cells.se.mx, L.cells.se.mz, L.cells.e.mx, L.cells.e.mz), true);
  assert.equal(circleWalk(L.cells.w.mx, L.cells.w.mz, L.cells.nw.mx, L.cells.nw.mz), true);
  assert.equal(circleWalk(L.cells.c.mx, L.cells.c.mz, L.cells.n.mx, L.cells.n.mz), true);
  assert.equal(circleWalk(L.cells.w.mx, L.cells.w.mz, L.doors.front.x + 1.2, L.doors.front.z), true);
  assert.equal(circleWalk(L.cells.e.mx, L.cells.e.mz, L.doors.back.x - 1.2, L.doors.back.z), true);
  assert.equal(circleWalk(L.cells.n.mx, L.cells.n.mz, L.doors.left.x, L.doors.left.z - 1.2), true);
  assert.equal(circleWalk(L.cells.s.mx, L.cells.s.mz, L.doors.right.x, L.doors.right.z + 1.2), true);
  assert.equal(
    circleWalk(L.cells.sw.mx, L.cells.sw.mz, L.corridors.sw.walkX, L.corridors.sw.walkZ),
    true
  );
  assert.equal(
    circleWalk(L.cells.se.mx, L.cells.se.mz, L.corridors.se.walkX, L.corridors.se.walkZ),
    true
  );
  assert.equal(
    circleWalk(L.cells.nw.mx, L.cells.nw.mz, L.corridors.nw.walkX, L.corridors.nw.walkZ),
    true
  );
  assert.equal(hitsAlphaSolid(-9, 0, CENTER), false);
  assert.equal(hitsAlphaSolid(0, 0, CENTER), false);
  assert.equal(
    L.office.maxX - 0.1 <= L.lobby.maxX && L.office.maxZ - 0.1 <= L.lobby.maxZ,
    true
  );
  assert.equal(circleWalk(L.cells.e.mx, L.cells.e.mz, L.cells.ne.mx, L.cells.ne.mz), false);
  assert.equal(
    circleWalk(L.cells.ne.mx, L.cells.ne.mz, L.corridors.ne.walkX, L.corridors.ne.walkZ),
    false
  );
  assert.equal(
    circleWalk(L.cells.ne.mx, L.cells.ne.mz, L.corridors.ne.walkX, L.corridors.ne.walkZ, {
      officeOpen: true,
    }),
    true
  );
  assert.equal(
    circleWalk(stairMidX, L.cells.ne.mz, stairMidX, (L.stairs.minZ + L.stairs.maxZ) * 0.5, {
      officeOpen: true,
    }),
    true
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
  assert.match(world, /meg_zephyr_barricade/);
  assert.match(world, /西风区扩建中|ALPHA_ZEPHYR_NOTE/);
  assert.match(src, /getMegRankIndex/);
  assert.match(src, /openTaskBoard/);
  assert.match(src, /sitOfficeChair/);
  assert.match(src, /openMegCareerStorage/);
  assert.match(src, /资质认证：选定四职之一/);
  assert.match(src, /isTaskUiOpen\(\)/);
  assert.match(src, /tapInteractId/);
  assert.match(src, /tryMegQAction/);
  assert.match(src, /tryOpenMegSideDoorAim/);
  assert.match(world, /buildMegCornerCorridors/);
  assert.match(world, /reloadMegClearChunks/);
  assert.match(world, /c\.minX <= startX \+ 0\.5/);
  assert.match(world, /if \(!north\) return false/);
  assert.match(world, /if \(id === "se"\) \{\s*addZephyrAt/);
  assert.match(world, /isInsideAabb\(px, pz, L\.lobby, 0\)/);
  assert.doesNotMatch(world, /isInsideAabb\(px, pz, L\.lobby, 0\.25\)/);
  assert.match(world, /cellAabbOverlaps\(c\.x, c\.z, L\.lobby, 0\)/);
  assert.match(world, /updateMegCorridorVisibility[\s\S]*group\.visible = true/);
  assert.match(world, /bw \+ 0\.35/);
  assert.doesNotMatch(world, /bw \+ 2\.5/);
  assert.match(world, /n\.mx \+ 5\.5/);
  assert.doesNotMatch(world, /n\.mx \+ 1\.15/);
  assert.match(world, /office\.maxX - 0\.12/);
  assert.doesNotMatch(world, /office\.minX \+ 0\.12/);
  assert.match(world, /which: "left"/);
  assert.match(world, /which: "right"/);
  assert.match(world, /which: "se"/);
  assert.match(world, /which: "sw"/);
  assert.match(world, /which: "nw"/);
  assert.match(src, /东南走廊门/);
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
  assert.match(html, /backrooms-level1\.js\?v=144/);
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
