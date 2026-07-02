// 小本本 Service Worker – PWA 离线缓存
const CACHE = "xiaobenben-v10";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=9",
  "./app.js?v=9",
  "./sync.js?v=9",
  "./manifest.json?v=5",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL);
    })
  );
  self.skipWaiting(); // 立即激活新SW
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // 立即控制所有页面
    })
  );
});

self.addEventListener("fetch", function(e) {
  // 跳过非 GET 请求、chrome-extension 请求
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.protocol === "chrome-extension:") return;
  // 不同步 Supabase API 请求（总是走网络）
  if (url.pathname.indexOf("/rest/v1/") !== -1) return;

  // 对带版本号的资源（?v=xx）使用network-first策略，确保最新
  var hasVersion = url.search.indexOf("v=") !== -1;

  if (hasVersion) {
    // network-first for versioned resources
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // default: cache-first with network update
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetched = fetch(e.request).then(function(response) {
        if (response && response.status === 200 && (response.type === "basic" || response.type === "cors")) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return cached;
      });
      return cached || fetched;
    })
  );
});
