const CACHE_VERSION = "v2.6";
const CACHE_NAME = `blueant-cache-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./index.html",
  "./login.css",
  "./login.js",
  "./bg.png",
  "./web-logo.png",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/********************** INSTALL **********************/
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn("Failed to cache:", asset, err);
        }
      }
    })
  );
});

/********************** ACTIVATE **********************/
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : null))
      );
      await self.clients.claim();
    })()
  );
});

/********************** HELPER: safe background cache write **********************/
function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return;
  const clone = response.clone();
  caches.open(CACHE_NAME)
    .then(cache => cache.put(request, clone))
    .catch(err => console.warn("Cache put failed:", request.url, err));
}

/********************** FETCH **********************/
self.addEventListener("fetch", event => {
  const req = event.request;

  // Skip non-GET requests
  if (req.method !== "GET") return;

  // External APIs (no caching) — let them go straight to network
  if (req.url.includes("/exec") || req.url.includes("supabase")) {
    return;
  }

  // HTML (Network first, fallback to cached index.html)
  if (req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(req);
          cachePut(req, networkRes);
          return networkRes;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // CSS / JS (Network first, cache fallback)
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(req);
          cachePut(req, networkRes);
          return networkRes;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Images (Cache first, network fallback)
  if (req.destination === "image") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const networkRes = await fetch(req);
          cachePut(req, networkRes);
          return networkRes;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Default: network first, fall back to cache
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});