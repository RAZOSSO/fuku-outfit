// Service Worker に読み込まれる、プッシュ通知の受け取り処理（vite.config.ts の importScripts）
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Today's Outfit", {
      body: data.body || '今日の服装を用意しました',
      icon: 'pwa-192x192.png',
      badge: 'pwa-64x64.png',
      tag: 'morning-outfit', // 同じ日に2回届いても1件にまとめる
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const appUrl = self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(appUrl))
      return open ? open.focus() : self.clients.openWindow(appUrl)
    }),
  )
})
