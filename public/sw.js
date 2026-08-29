self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
// sw.js — place this file at the ROOT of what your site serves as static files
// (same folder as index.html), so it ends up reachable at https://yourapp.com/sw.js
// This is what lets a push notification arrive and show up even when the app
// is fully closed / not open in any tab.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when the Cloudflare Worker sends a push message via the Push API.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Notification", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MDCAT Prep";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag || undefined, // set a tag to replace/collapse repeated notifications instead of stacking
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification opens (or focuses) the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
