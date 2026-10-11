// Installable staff app (separate from the customer app so each opens in the right place).
export function GET() {
  return Response.json(
    {
      name: "Mithai Wallah Ops",
      short_name: "MW Ops",
      description: "Deliveries, milk collection, production and accounts for Anuradha Enterprises",
      id: "/ops",
      start_url: "/ops/today",
      scope: "/ops",
      display: "standalone",
      background_color: "#f5f6f7",
      theme_color: "#16323f",
      categories: ["business", "productivity"],
      icons: [
        { src: "/icons/ops-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/ops-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
      shortcuts: [
        { name: "Today", url: "/ops/today", icons: [{ src: "/icons/ops-192.png", sizes: "192x192" }] },
        { name: "Delivery run", url: "/ops/deliveries", icons: [{ src: "/icons/ops-192.png", sizes: "192x192" }] },
        { name: "Record milk", url: "/ops/procurement/entry", icons: [{ src: "/icons/ops-192.png", sizes: "192x192" }] },
        { name: "Production", url: "/ops/production", icons: [{ src: "/icons/ops-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }
  );
}
