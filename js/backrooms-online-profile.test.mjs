/**
 * M.E.G. 编制锁：单机锁定 / 服务器解锁 / 重试冷却 / 并发身份去重。
 * 运行：node js/backrooms-online-profile.test.mjs
 */
import assert from "node:assert/strict";

function installDom() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.sessionStorage = { setItem() {}, getItem: () => null, removeItem() {} };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  };
  globalThis.window = { dispatchEvent() {} };
  return store;
}

function serverFetch(state) {
  return async function (url, options) {
    state.calls.push(url);
    if (state.down) throw new TypeError("Failed to fetch");
    if (url.endsWith("/status")) {
      return jsonResponse(200, { ok: true, megOnline: true, locked: false });
    }
    if (url.endsWith("/identity")) {
      const body = JSON.parse(options.body || "{}");
      const bearer = (options.headers.Authorization || "").replace("Bearer ", "");
      if (bearer) {
        if (bearer !== state.token) return jsonResponse(401, { ok: false, message: "设备凭证无效" });
        return jsonResponse(200, { ok: true, restored: true, profile: state.profile });
      }
      state.identityCreations += 1;
      state.token = "token-" + state.identityCreations;
      state.profile = { identityId: state.identityCreations, rank: "none", department: "", contribution: 0, status: "active", displayName: body.displayName };
      return jsonResponse(201, { ok: true, token: state.token, profile: state.profile });
    }
    return jsonResponse(200, { ok: true, profile: state.profile });
  };
}

function jsonResponse(status, body) {
  return { ok: status < 400, status, json: async () => body };
}

async function loadModule() {
  return import("./backrooms-online-profile.js?case=" + Math.random());
}

async function testOfflineLock() {
  installDom();
  const state = { calls: [], down: true, identityCreations: 0 };
  globalThis.fetch = serverFetch(state);
  const meg = await loadModule();

  assert.equal(meg.isMegOnline(), false, "初始应为锁定");
  assert.equal(meg.getMegOnlineProfile().locked, true);

  const profile = await meg.syncMegOnlineProfile();
  assert.equal(profile.locked, true, "离线同步应解析为锁定档案而不是抛错");

  await assert.rejects(() => meg.recordMegCareerEvent("task_complete", { levelId: "l1" }), /锁定|服务器/);

  const callsAfterFirstEvent = state.calls.length;
  for (let i = 0; i < 20; i += 1) {
    await assert.rejects(() => meg.recordMegCareerEvent("task_complete", { levelId: "l1" }));
  }
  assert.equal(state.calls.length, callsAfterFirstEvent, "冷却期内不应继续发探活请求");
}

async function testConcurrentIdentity() {
  installDom();
  const state = { calls: [], down: false, identityCreations: 0 };
  globalThis.fetch = serverFetch(state);
  const meg = await loadModule();

  await Promise.all([
    meg.syncMegOnlineProfile(),
    meg.syncMegOnlineProfile(),
    meg.recordMegCareerEvent("task_complete", { levelId: "l1" }),
    meg.recordMegCareerEvent("level_footprint", { levelId: "l2" }),
  ]);

  assert.equal(state.identityCreations, 1, "并发调用只能创建一个服务器身份");
  assert.equal(meg.isMegOnline(), true);
  assert.equal(meg.getMegOnlineProfile().identityId, 1);
  assert.equal(localStorage.getItem("backrooms_meg_identity_token_v1"), "token-1");
}

async function testStaleTokenRecovery() {
  const store = installDom();
  const state = { calls: [], down: false, identityCreations: 0, token: "server-side-only" };
  store.set("backrooms_meg_identity_token_v1", "expired-token");
  globalThis.fetch = serverFetch(state);
  const meg = await loadModule();

  await meg.syncMegOnlineProfile();
  assert.equal(meg.isMegOnline(), true, "失效凭证应重新注册身份");
  assert.equal(state.identityCreations, 1);
}

async function testRecoveryAfterServerReturns() {
  installDom();
  const state = { calls: [], down: true, identityCreations: 0 };
  globalThis.fetch = serverFetch(state);
  const meg = await loadModule();

  await meg.syncMegOnlineProfile();
  assert.equal(meg.isMegOnline(), false);

  state.down = false;
  await meg.syncMegOnlineProfile(true);
  assert.equal(meg.isMegOnline(), true, "服务器恢复后强制同步应解锁");
  assert.equal(meg.getMegOnlineProfile().locked, false);
}

const tests = [
  ["单机锁定与重试冷却", testOfflineLock],
  ["并发身份去重", testConcurrentIdentity],
  ["失效凭证重建", testStaleTokenRecovery],
  ["服务器恢复后解锁", testRecoveryAfterServerReturns],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log("ok - " + name);
  } catch (err) {
    failed += 1;
    console.error("not ok - " + name + "\n  " + (err && err.message));
  }
}
if (failed) process.exit(1);
console.log("\n全部通过：" + tests.length + " 项");
