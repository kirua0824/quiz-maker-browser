const CACHE_NAME = "quiz-maker-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=6",
  "./config.js?v=2",
  "./src/game.js?v=8",
  "./data/decks/catalog.json",
  "./data/decks/history1.md",
  "./data/decks/geography1.md",
  "./data/decks/geography2.md",
  "./data/decks/social_standard_3.md",
  "./data/decks/science_standard_1.md",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
