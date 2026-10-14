// Installable Sales app for the field team (separate from the Ops and customer apps).
export function GET() {
  return Response.json(
    {
      name: "Mithai Wallah Sales",
      short_name: "MW Sales",
      description: "Field sales for Mithai Wallah: sweet shop customers, visits and wholesale orders",
      id: "/sales",
      start_url: "/sales",
      scope: "/sales",
      display: "standalone",
      background_color: "#f5f6f7",
      theme_color: "#16323f",
      categories: ["business", "productivity"],
      icons: [
        { src: "/icons/sales-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/sales-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
      shortcuts: [
        { name: "Create customer order", url: "/sales/order", icons: [{ src: "/icons/sales-192.png", sizes: "192x192" }] },
        { name: "Add new B2B customer", url: "/sales/customers/new", icons: [{ src: "/icons/sales-192.png", sizes: "192x192" }] },
        { name: "Customers", url: "/sales/customers", icons: [{ src: "/icons/sales-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }
  );
}
