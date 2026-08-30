/**
 * 极危行动 — 客户端资源包
 * 把后室/大厅静态文件缓存到本机；接口与 WebSocket 仍走网络。
 */
const PACK_VERSION = 3;
const CACHE_PREFIX = "jiwei-client-pack-";
const CACHE_NAME = CACHE_PREFIX + PACK_VERSION;

function packUrl(path) {
  return new URL(path.replace(/^\//, ""), self.location.origin).href;
}

function sameOrigin(url) {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin;
  } catch (err) {
    return false;
  }
}

function shouldBypass(url) {
  var parsed = new URL(url, self.location.origin);
  if (parsed.origin !== self.location.origin) return true;
  var path = parsed.pathname;
  if (path.indexOf("/socket.io") === 0) return true;
  if (path.indexOf("/api/") === 0) return true;
  if (path.indexOf("/admin/") === 0) return true;
  if (path === "/sw.js") return true;
  return false;
}

function cacheKeyFor(request) {
  var parsed = new URL(request.url, self.location.origin);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function postProgress(payload) {
  return self.clients.matchAll({ includeUncontrolled: true }).then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage(payload);
    });
  });
}

function fillPack(cache, files) {
  var total = files.length;
  return cache.keys().then(function (keys) {
    if (keys.length >= total && total > 0) {
      return postProgress({
        type: "jiwei-pack-progress",
        done: total,
        total: total,
        version: PACK_VERSION,
      });
    }
    var done = 0;
    var index = 0;
    var workers = 4;

    function next() {
      if (index >= files.length) return Promise.resolve();
      var rel = files[index];
      index += 1;
      var href = packUrl(rel);
      return fetch(href, { cache: "no-store" })
        .then(function (resp) {
          if (resp && resp.ok) return cache.put(href, resp);
        })
        .catch(function () {
          /* 单文件失败不中断整包 */
        })
        .then(function () {
          done += 1;
          if (done === total || done % 8 === 0) {
            return postProgress({
              type: "jiwei-pack-progress",
              done: done,
              total: total,
              version: PACK_VERSION,
            });
          }
        })
        .then(next);
    }

    var chain = [];
    var i;
    for (i = 0; i < workers; i++) chain.push(next());
    return Promise.all(chain).then(function () {
      return postProgress({
        type: "jiwei-pack-progress",
        done: total,
        total: total,
        version: PACK_VERSION,
      });
    });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    fetch(packUrl("api/client-pack"), { cache: "no-store" })
      .then(function (resp) {
        if (!resp || !resp.ok) throw new Error("pack manifest failed");
        return resp.json();
      })
      .then(function (data) {
        var files = data && data.files ? data.files : [];
        return caches.open(CACHE_NAME).then(function (cache) {
          return fillPack(cache, files);
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return undefined;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "jiwei-pack-now") {
    event.waitUntil(
      fetch(packUrl("api/client-pack"), { cache: "no-store" })
        .then(function (resp) {
          return resp.json();
        })
        .then(function (manifest) {
          return caches.open(CACHE_NAME).then(function (cache) {
            return fillPack(cache, manifest.files || []);
          });
        })
    );
  }
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  if (shouldBypass(request.url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(cacheKeyFor(request), response.clone());
            });
          }
          return response;
        })
        .catch(function () {
          return caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(cacheKeyFor(request));
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      var key = cacheKeyFor(request);
      return cache.match(key).then(function (cached) {
        if (cached) return cached;
        return fetch(request)
          .then(function (resp) {
            if (resp && resp.ok && sameOrigin(request.url)) {
              cache.put(key, resp.clone());
            }
            return resp;
          })
          .catch(function () {
            return cached || Response.error();
          });
      });
    })
  );
});
