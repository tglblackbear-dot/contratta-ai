const CACHE_NAME = "contratta-static-f6806b23-" + "__BUILD_ID__";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/rest/") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("/functions/") ||
    url.pathname.includes("/storage/")
  ) {
    return;
  }

  event.respondWith(
    fetch(request).then(async (response) => {
      if (response.ok && response.type === "basic" && request.mode !== "navigate") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match("./index.html")) || (await caches.match("./offline.html"));
      }
      return Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "Contratta AI";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 300) : "Você tem uma atualização.";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 100) : "contratta-notification";
  const targetUrl = typeof payload.url === "string" ? payload.url : self.registration.scope;

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: new URL("favicon.svg", self.registration.scope).toString(),
    data: { url: targetUrl },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scopeUrl = new URL(self.registration.scope);
  let targetUrl = scopeUrl;
  try {
    const requestedUrl = new URL(event.notification.data?.url ?? scopeUrl);
    if (requestedUrl.origin === scopeUrl.origin && requestedUrl.pathname.startsWith(scopeUrl.pathname)) {
      targetUrl = requestedUrl;
    }
  } catch {
    targetUrl = scopeUrl;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === targetUrl.origin && clientUrl.pathname.startsWith(scopeUrl.pathname);
      });
      if (existing) {
        return existing.navigate(targetUrl.toString()).then(() => existing.focus());
      }
      return self.clients.openWindow(targetUrl.toString());
    }),
  );
});
