import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/login", "/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
