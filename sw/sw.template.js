/* Palettenzähler Service Worker (wird beim Build erzeugt) */
const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const CACHE = 'palettenzaehler-' + VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('palettenzaehler-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Nur eigene Dateien cachen, API und Firebase immer live
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    // Netzwerk zuerst, offline die App Shell
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (treffer) =>
        treffer ||
        fetch(req).then((antwort) => {
          if (antwort.ok && url.pathname.startsWith('/assets/')) {
            const kopie = antwort.clone()
            caches.open(CACHE).then((cache) => cache.put(req, kopie))
          }
          return antwort
        }),
    ),
  )
})
