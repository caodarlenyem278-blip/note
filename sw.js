// 小本本 Service Worker – PWA 离线缓存 v13
const CACHE = "xiaobenben-v13";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=13",
  "./app.js?v=13",
  "./sync.js?v=13",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL).catch(function(err) {
        console.log("Cache addAll failed:", err);
        // 逐个缓存，失败的跳过
        return Promise.all(SHELL.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.log("Failed to cache:", url, e);
          });
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
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.protocol === "chrome-extension:") return;
  // 不同步 Supabase API 请求
  if (url.pathname.indexOf("/rest/v1/") !== -1) return;
  // 跳过跨域请求
  if (url.origin !== self.location.origin) return;

  // 对版本化资源使用network-first
  var hasVersion = url.search.indexOf("v=") !== -1;

  if (hasVersion) {
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

  // 对manifest和icons使用stale-while-revalidate
  var isStatic = /\.(png|jpg|jpeg|gif|svg|webp|ico|json|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        var fetchPromise = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE).then(function(cache) {
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(function() { return cached; });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 默认: cache-first with network update
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
