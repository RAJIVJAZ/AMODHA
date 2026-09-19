import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { blogPosts } from "@/data/blog";

export const metadata: Metadata = {
  title: "Blog | Dairy & Mithai Insights from Amodha",
  description:
    "Articles on traditional dairy-making, mithai craftsmanship, and gifting guides from Amodha Dairy Products and Mithaiwallah Sweet Corner.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Insights"
          title="Dairy & Mithai Insights"
          description="Stories on traditional craftsmanship, quality, and gifting guides from our team."
        />

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col sticker-shadow rounded-2xl border-2 border-ink bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
                {post.category}
              </span>
              <h2 className="mt-2 text-xl font-bold text-ink">{post.title}</h2>
              <p className="mt-3 flex-1 text-sm text-dark/70">{post.excerpt}</p>
              <div className="mt-5 flex items-center justify-between text-xs text-dark/50">
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <span>{post.readingTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
