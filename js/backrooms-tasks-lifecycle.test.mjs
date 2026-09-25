import test from "node:test";
import assert from "node:assert/strict";

function storage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
globalThis.document = {};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
};

const tasks = await import("./backrooms-tasks.js");

function reset(...offers) {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("backrooms_task_board_offers_v1", JSON.stringify(offers));
}

test("public field task completes through the shared level-entry runtime", () => {
  reset("general_snack_61");
  assert.equal(tasks.acceptTask("general_snack_61").ok, true);
  const progress = tasks.progressTasksForLevel("l6_1", () => {});
  assert.equal(progress.length, 1);
  assert.equal(progress[0].done, true);
  assert.equal(tasks.isTaskDelivered("general_snack_61"), true);
  assert.equal(tasks.claimTaskReward("general_snack_61").ok, true);
  assert.equal(tasks.isTaskAccepted("general_snack_61"), false);
});

test("legacy Level 1 package still requires explicit receiver handoff", () => {
  reset("package_l1");
  assert.equal(tasks.acceptTask("package_l1").ok, true);
  tasks.progressTasksForLevel("l1", () => {});
  assert.equal(tasks.isTaskDelivered("package_l1"), false);
  assert.equal(tasks.deliverPackageTask("package_l1").ok, true);
  assert.equal(tasks.isTaskDelivered("package_l1"), true);
});

test("generic cooler inspection completes and claims the public task", () => {
  reset("inspect_coolers");
  assert.equal(tasks.acceptTask("inspect_coolers").ok, true);
  assert.equal(tasks.recordCoolerInspect("cooler-a").done, false);
  const completed = tasks.recordCoolerInspect("cooler-b");
  assert.equal(completed.done, true);
  assert.equal(completed.reward, 5);
  assert.equal(tasks.isTaskAccepted("inspect_coolers"), false);
});

test("specialty lanes are locked without the matching formal department", () => {
  reset("explore_map_l2");
  const result = tasks.acceptTask("explore_map_l2");
  assert.equal(result.ok, false);
  assert.match(result.reason, /探索专员/);
});

test("accepting a field task on the current level records it immediately", () => {
  reset("general_snack_61");
  assert.equal(tasks.acceptTask("general_snack_61", { currentLevelId: "l6_1" }).ok, true);
  assert.equal(tasks.isTaskDelivered("general_snack_61"), true);
});

test("research climax no longer depends on the explore-lane beacon", () => {
  const pages = tasks.getTaskDef("pages_c1299");
  assert.deepEqual(pages.requiresEverCompleted, ["sample_c1299_fog"]);
  assert.equal(tasks.getTaskDef("sample_c1299_fog").lane, "research");
  assert.equal(tasks.getTaskDef("loop_c192").lane, "explore");
});

test("L4 destination package does not auto-deliver when accepted at the board", () => {
  reset("logistics_vault_turnover_l4");
  const profile = { rank: "member", department: "logistics" };
  assert.equal(
    tasks.acceptTask("logistics_vault_turnover_l4", {
      currentLevelId: "l4",
      profile,
    }).ok,
    true
  );
  assert.equal(tasks.isTaskDelivered("logistics_vault_turnover_l4"), false);
  const progress = tasks.progressTasksForLevel("l4", () => {});
  assert.equal(progress.length, 1);
  assert.equal(tasks.isTaskDelivered("logistics_vault_turnover_l4"), true);
});

test("specialty board lanes stay hidden without a matching formal department", () => {
  reset();
  const locked = { rank: "none", department: "", locked: true };
  assert.equal(tasks.canShowTaskLane("general", locked), true);
  assert.equal(tasks.canShowTaskLane("explore", locked), false);
  assert.equal(tasks.canShowTaskLane("logistics", locked), false);
  assert.equal(
    tasks.canShowTaskLane("explore", { rank: "member", department: "explore" }),
    true
  );
});

test("security cooler inspect is treated as an active L4 inspect task", () => {
  reset("security_inspect_deep_l4");
  const profile = { rank: "member", department: "security" };
  assert.equal(tasks.getActiveCoolerInspectTask(), null);
  assert.equal(
    tasks.acceptTask("security_inspect_deep_l4", { profile }).ok,
    true
  );
  assert.equal(tasks.getActiveCoolerInspectTask().id, "security_inspect_deep_l4");
});
