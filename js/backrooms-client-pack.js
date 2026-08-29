/**
 * 注册客户端资源包 Service Worker，并在需要时等待首次打包完成。
 */
(function (global) {
  var PACK_VERSION = 2;
  var lastProgress = { done: 0, total: 0, version: PACK_VERSION };
  var waiters = [];

  function isSecureContextOk() {
    if (!("serviceWorker" in navigator)) return false;
    if (global.isSecureContext) return true;
    var host = global.location && global.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }

  function notifyWaiters() {
    if (!lastProgress.total || lastProgress.done < lastProgress.total) return;
    waiters.splice(0).forEach(function (resolve) {
      resolve(lastProgress);
    });
  }

  function onMessage(event) {
    var data = event.data || {};
    if (data.type !== "jiwei-pack-progress") return;
    lastProgress = data;
    notifyWaiters();
  }

  navigator.serviceWorker &&
    navigator.serviceWorker.addEventListener("message", onMessage);

  function register() {
    if (!isSecureContextOk()) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register("sw.js").catch(function () {
      return null;
    });
  }

  function ensurePacked(opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 120000;
    if (!isSecureContextOk()) return Promise.resolve({ skipped: true });

    return register().then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      if (reg && reg.active) {
        reg.active.postMessage({ type: "jiwei-pack-now" });
      }
      if (lastProgress.total && lastProgress.done >= lastProgress.total) {
        return lastProgress;
      }
      return new Promise(function (resolve) {
        var timer = global.setTimeout(function () {
          resolve({ timedOut: true, done: lastProgress.done, total: lastProgress.total });
        }, timeoutMs);
        waiters.push(function (progress) {
          global.clearTimeout(timer);
          resolve(progress);
        });
      });
    });
  }

  register();

  global.BackroomsClientPack = {
    register: register,
    ensurePacked: ensurePacked,
  };
})(window);
