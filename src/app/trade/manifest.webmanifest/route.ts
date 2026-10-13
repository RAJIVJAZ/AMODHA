// Installable Wholesale app for sweet shops (separate from the retail shop and the staff app).
export function GET() {
  return Response.json(
    {
      name: "Mithai Wallah Wholesale",
      short_name: "MW Wholesale",
      description: "Wholesale ordering, tracking and account statements for sweet shops — Anuradha Enterprises, Prayagraj",
      id: "/trade",
      start_url: "/trade",
      scope: "/trade",
      display: "standalone",
      background_color: "#f6f4f1",
      theme_color: "#16323f",
      categories: ["business", "shopping"],
      icons: [
        { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
      shortcuts: [
        { name: "Quick order", url: "/trade/quick-order", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
        { name: "Orders", url: "/trade/orders", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }
  );
}
