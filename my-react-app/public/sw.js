const CACHE_NAME = 'inventoscan-shell-v4'
const APP_SHELL = ['/', '/index.html', '/favicon.png', '/inventoscan-logo.png', '/inventoscan-logo-192.png', '/manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('inventoscan-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.searchParams.has('confirm-email')) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    try {
      const response = await fetch(event.request)
      if (response.ok && (event.request.mode === 'navigate' || ['script','style','image','font'].includes(event.request.destination))) {
        await cache.put(event.request, response.clone()).catch(() => {})
      }
      return response
    } catch {
      const cached = await cache.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') return await cache.match('/index.html') || await cache.match('/') || Response.error()
      return Response.error()
    }
  })())
})
