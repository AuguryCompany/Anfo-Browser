// Anfo uygulama kabuğu önbelleği (yalnızca web sürümü).
// Adı karma içeren dosyalar (assets/) değişmez: önce önbellek. Sayfa: önce ağ, çevrimdışıysa önbellek.
// Başka sitelere giden istekler (arama, hava durumu, GitHub) hiç önbelleğe alınmaz.
const SHELL = 'anfo-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './favicon.png', './manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('anfo-shell') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(e.request, copy))
            return res
          }),
      ),
    )
    return
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  )
})
