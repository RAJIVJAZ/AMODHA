// Service worker for the installed Wholesale app. It caches nothing: prices, stock and orders always
// come from the server. Without a connection, page loads get a small offline screen.
const offlinePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#16323f"><title>Offline · MW Wholesale</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f4f1;color:#16323f;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
main{max-width:340px;text-align:center}h1{font-size:22px;margin:12px 0 4px}p{margin:0 0 20px;color:#475569}
button{background:#16323f;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600}</style></head>
<body><main><div style="font-size:44px" aria-hidden="true">📶</div><h1>You're offline</h1>
<p>Mithai Wallah Wholesale needs the internet to show prices and place orders. Nothing was sent; try again when you have signal.</p>
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
      "Service-Worker-Allowed": "/trade",
    },
  });
}
