import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private pages (account, login, cart, checkout, ops, sales, trade, admin) are not blocked here:
      // they carry a noindex tag, and Google has to be able to fetch a page to see it. Blocking them
      // would let their addresses show in results as "indexed, though blocked by robots.txt".
      disallow: ["/api/", "/invoice", "/auth/", "/dev/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
