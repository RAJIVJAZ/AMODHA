import type { MetadataRoute } from "next";

// Lets customers install Mithai Wallah on their phone; opens on their account (orders, milk deliveries).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mithai Wallah",
    short_name: "Mithai Wallah",
    description: "Pure desi ghee sweets and fresh milk from Prayagraj",
    id: "/",
    start_url: "/account",
    scope: "/",
    display: "standalone",
    background_color: "#fff0f0",
    theme_color: "#16323f",
    icons: [
      { src: "/icons/app-192-any.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512-any.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
