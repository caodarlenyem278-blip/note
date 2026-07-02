// 小本本 Service Worker – PWA 离线缓存 v18 (fixed install flow)
const CACHE = "xiaobenben-v18";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=18",
  "./app.js?v=18",
  "./sync.js?v=18",
  "./manifest.json?v=18",
  "./icon-192.png?v=18",
  "./icon-512.png?v=18",
  "./icon-maskable-192.png?v=18",
  "./icon-maskable-512.png?v=18"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL).catch(function() {
        return Promise.all(SHELL.map(function(url) {
          return cache.add(url).catch(function() {});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.protocol === "chrome-extension:") return;
  if (url.pathname.indexOf("/rest/v1/") !== -1) return;
  if (url.origin !== self.location.origin) return;

  // Network-first for versioned resources
  if (url.search.indexOf("v=") !== -1) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() { return caches.match(e.request); })
    );
    return;
  }

  var isStatic = /\.(png|jpg|jpeg|gif|svg|webp|ico|json|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        var fp = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
          }
          return response;
        }).catch(function() { return cached; });
        return cached || fp;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetched = fetch(e.request).then(function(response) {
        if (response && response.status === 200 && (response.type === "basic" || response.type === "cors")) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() { return cached; });
      return cached || fetched;
    })
  );
});
