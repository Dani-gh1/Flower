// Service worker til Flower: gør at appen åbner som en rigtig app (også
// uden internet) og kan vise notifikationer på telefonen.
const CACHE = "flower-v6";
const SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "joint.webp",
  "logo.svg",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Selve appen: prøv nettet først (så opdateringer kommer med det samme),
// og brug den gemte kopi, når der ikke er internet.
// Kortbilleder, databasen og GitHub gemmes ikke her.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isApp = url.origin === self.location.origin;
  const isLib = url.hostname === "unpkg.com" || (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"));
  if (!isApp && !isLib) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});

// Push fra serveren (GitHub Action), også når appen er lukket
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Flower", {
      body: data.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "./" },
    })
  );
});

// Tryk på en notifikation åbner appen (eller hopper tilbage til den)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((client) => "focus" in client);
      if (open) return open.focus();
      return self.clients.openWindow("./");
    })
  );
});
