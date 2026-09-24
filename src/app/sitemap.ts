import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
import { dairyProducts } from "@/data/dairy-products";
import { sweets } from "@/data/sweets";
import { blogPosts } from "@/data/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/about",
    "/dairy-products",
    "/our-process",
    "/corporate-gifting",
    "/wedding-gifting",
    "/wholesale",
    "/blog",
    "/faq",
    "/contact",
    "/privacy-policy",
    "/terms",
    "/refund-policy",
    "/shipping-policy",
  ].map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.7,
  }));

  const productRoutes = dairyProducts.map((product) => ({
    url: `${siteConfig.url}/dairy-products/${product.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const sweetRoutes = sweets.map((sweet) => ({
    url: `${siteConfig.url}/sweet-corner/${sweet.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const blogRoutes = blogPosts.map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...productRoutes, ...sweetRoutes, ...blogRoutes];
}
