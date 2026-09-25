import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MEG_HIGH_RISK_TASK_IDS,
  MEG_TASK_CATALOG,
  MEG_TASK_IDS,
  MEG_TASK_LANES,
  validateMegTaskCatalog,
} from "./backrooms-meg-task-catalog.js";
import { PLAYER_CAMP_ARTICLE, playerCampArticleText } from "./backrooms-player-camp-article.js";

test("catalog contains five lanes with ten playable tasks each", () => {
  assert.deepEqual(validateMegTaskCatalog(), []);
  assert.equal(MEG_TASK_CATALOG.length, 50);
  for (const lane of MEG_TASK_LANES) {
    assert.equal(
      MEG_TASK_CATALOG.filter((task) => task.lane === lane).length,
      10,
      lane
    );
  }
});

test("department climaxes only require same-lane prerequisites", () => {
  for (const task of MEG_TASK_CATALOG) {
    for (const req of task.requiresEverCompleted || []) {
      const prereq = MEG_TASK_CATALOG.find((entry) => entry.id === req);
      assert.ok(prereq, `${task.id} missing prereq ${req}`);
      assert.equal(
        prereq.lane,
        task.lane,
        `${task.id} depends on other-lane ${req}`
      );
    }
  }
});

test("every task has a supported completion binding", () => {
  const supported = new Set(["package", "map", "inspect", "recon", "field"]);
  for (const task of MEG_TASK_CATALOG) {
    assert.ok(supported.has(task.type), `${task.id}: unsupported ${task.type}`);
    assert.ok(task.title && task.desc);
    assert.ok(Number.isFinite(task.reward));
    if (task.type === "field") assert.ok(task.fieldLevelIds.length);
    if (task.type === "package") assert.ok(task.packageId && task.destinationLevelId);
    if (task.type === "map") assert.ok(task.drawLevelId);
    if (task.type === "inspect") assert.ok(task.inspectTarget > 0);
    if (task.type === "recon") assert.ok(task.reconTarget > 0);
  }
});

test("server governance whitelist stays synchronized with the catalog", async () => {
  const source = await readFile(new URL("../server/db.py", import.meta.url), "utf8");
  for (const id of MEG_TASK_IDS) {
    assert.match(source, new RegExp(`["']${id}["']`), `server missing ${id}`);
  }
  assert.doesNotMatch(source, /["']fasting_cruise["']/);
  const highRiskBlock =
    source.match(/MEG_HIGH_RISK_TASK_IDS\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  for (const id of MEG_HIGH_RISK_TASK_IDS) {
    assert.match(
      highRiskBlock,
      new RegExp(`["']${id}["']`),
      `server high-risk missing ${id}`
    );
  }
  const serverHighRisk = Array.from(
    highRiskBlock.matchAll(/["']([a-z0-9_]+)["']/g),
    (match) => match[1]
  ).sort();
  assert.deepEqual(serverHighRisk, [...MEG_HIGH_RISK_TASK_IDS].sort());
});

test("Level 8 logistics task uses the cave-system name", () => {
  const task = MEG_TASK_CATALOG.find((entry) => entry.id === "logistics_aid_l8");
  assert.ok(task);
  assert.match(task.title, /岩洞系统/);
  assert.doesNotMatch(task.title, /Hollow Nest/);
});

test("player camp article stays renderable as MEG copy", () => {
  assert.equal(PLAYER_CAMP_ARTICLE.id, "meg_logistics_player_camp_v1");
  const text = playerCampArticleText();
  assert.match(text, /流浪者自建营地/);
  assert.match(text, /营地包/);
});
