// Service worker for the installed business app. It caches nothing: business data stays on the
// server. When the phone has no connection, page loads get a small offline screen instead of the
// browser's error page.
const offlinePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#16323f"><title>Offline · MW Ops</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f7;color:#16323f;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
main{max-width:340px;text-align:center}h1{font-size:22px;margin:12px 0 4px}p{margin:0 0 20px;color:#475569}
button{background:#16323f;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600}</style></head>
<body><main><div style="font-size:44px" aria-hidden="true">📶</div><h1>You're offline</h1>
<p>MW Ops needs the internet to load and save. Nothing you entered was sent; try again when you have signal.</p>
<button onclick="location.reload()">Try again</button></main></body></html>`;

const script = `const OFFLINE = ${JSON.stringify(offlinePage)};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      // Lets the worker control /ops itself as well as the pages under it.
      "Service-Worker-Allowed": "/ops",
    },
  });
}
