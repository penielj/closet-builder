// Service worker: caches the built app so it opens offline (DESIGN §7 "Offline").
// Weather requests go to another origin and aren't touched. At build time,
// vite.config.ts fills in every built file and a hash of that list as the version.

const PRECACHE = __PRECACHE__
const CACHE = `closet-${__VERSION__}`
const INDEX = PRECACHE[0] // the app's base URL, which serves index.html

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('closet-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Every page in the app is the one index.html. Cache first, so it opens instantly offline.
  if (request.mode === 'navigate' && url.pathname === new URL(INDEX, self.location.href).pathname) {
    event.respondWith(caches.match(INDEX).then((hit) => hit ?? fetch(request)))
    return
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)))
})
