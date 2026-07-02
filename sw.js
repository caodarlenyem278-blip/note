// 小本本 Service Worker v19 - stable offline cache
const CACHE = "xiaobenben-v19";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=19",
  "./app.js?v=19",
  "./sync.js?v=19",
  "./manifest.json?v=19",
  "./icon-192.png?v=19",
  "./icon-512.png?v=19",
  "./icon-maskable-192.png?v=19",
  "./icon-maskable-512.png?v=19"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL).catch(function() {
        // Try adding resources one by one
        return Promise.all(SHELL.map(function(url) {
          return fetch(url).then(function(res) {
            if (res.ok) return cache.put(url, res);
          }).catch(function() {});
        }));
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.protocol === "chrome-extension:") return;
  if (url.origin !== self.location.origin) return;
  // Don't cache Supabase API calls
  if (url.pathname.indexOf("/rest/v1/") !== -1) return;
  if (url.pathname.indexOf("/auth/v1/") !== -1) return;
  if (url.pathname.indexOf("/realtime/v1/") !== -1) return;

  // Network-first for versioned resources to ensure updates
  if (url.search && url.search.indexOf("v=") !== -1) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Cache-first for static assets
  var isStatic = /\.(png|jpg|jpeg|gif|svg|webp|ico|json|webmanifest|css|js)$/.test(url.pathname);
  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        var networkFetch = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
          }
          return response;
        }).catch(function() { return cached; });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Network-first for HTML (to get latest)
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200 && (response.type === "basic" || response.type === "cors")) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
