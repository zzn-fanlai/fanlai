/* ============================================================
   饭来 · Service Worker（离线可用）
   ------------------------------------------------------------
   策略：
   - 静态资源：预缓存 + cache-first（离线秒开）
   - Supabase API：直连网络，不缓存（数据必须新鲜）
   - 导航请求：先走缓存，失败回退 index.html
   ============================================================ */
const VERSION = "fanlai-v1.3.7";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./js/app.js",
  "./js/demo.js",
  "./js/store.js",
  "./js/sync.js",
  "./js/lib/util.js",
  "./js/lib/catalog.js",
  "./js/lib/ingredients.js",
  "./js/lib/parse.js",
  "./js/lib/ocr.js",
  "./js/lib/model.js",
  "./js/lib/exportText.js",
  "./js/lib/exportImage.js",
  "./js/ui/kit.js",
  "./js/ui/link.js",
  "./js/ui/parts.js",
  "./js/ui/slot.js",
  "./js/views/onboard.js",
  "./js/views/cook.js",
  "./js/views/dish.js",
  "./js/views/menu.js",
  "./js/views/shop.js",
  "./js/views/steps.js",
  "./js/views/outing.js",
  "./js/views/history.js",
  "./js/views/me.js",
  "./assets/splash.jpg",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[饭来] 预缓存失败", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 云端 API 一律走网络
  if (url.pathname.includes("/rest/v1/")) return;

  // 只处理同源资源
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，离线回退缓存
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // 静态资源：先用缓存秒开，同时后台拉新版（stale-while-revalidate）
  // —— 这样即使这次用的是旧 JS，下一次打开一定是最新的
  event.respondWith(
    caches.match(req).then((hit) => {
      const fetching = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetching;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
