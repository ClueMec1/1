// sw.js — deliberately minimal. It caches the app shell (index.html +
// manifest.json) so the app installs and opens instantly, but live data
// (chat, calendar, feed, recipes, AI) always comes fresh from Firestore
// — and the Gemini API — never the cache.

const CACHE = "fam-board-shell-v40";
const SHELL_FILES = [
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only manage this app's own files (index.html, manifest.json, icons).
  // Everything else — Firestore, Storage, the Gemini API, Hebcal, GIPHY,
  // chess.js from its CDN, uploaded media, embedded games — is a
  // different origin and passes straight through, completely untouched.
  if (url.origin !== self.location.origin) return;

  // Network-first, falling back to cache only if the network genuinely
  // fails (offline). This is the actual fix for "the phone doesn't get
  // updates" — the previous version served the app shell cache-first,
  // meaning a phone could keep showing a stale cached copy indefinitely
  // no matter how quickly a new service worker installed in the
  // background, since the already-open page never re-fetched it. Now
  // every load tries the network first, so "the newest version" is the
  // default outcome everywhere, not something that depends on the
  // service-worker-update lifecycle timing out correctly on every device.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
