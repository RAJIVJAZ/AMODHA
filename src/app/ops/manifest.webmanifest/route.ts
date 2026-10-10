// Installable staff app (separate from the customer app so each opens in the right place).
export function GET() {
  return Response.json(
    {
      name: "Mithai Wallah Ops",
      short_name: "MW Ops",
      description: "Production, stock, dispatch and finance for Anuradha Enterprises",
      id: "/ops",
      start_url: "/ops",
      scope: "/ops",
      display: "standalone",
      background_color: "#f5f6f7",
      theme_color: "#16323f",
      icons: [
        { src: "/icons/ops-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/ops-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }
  );
}
