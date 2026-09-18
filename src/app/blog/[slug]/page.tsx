import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CtaSection } from "@/components/ui/cta-section";
import { blogPosts, getBlogPost } from "@/data/blog";
import { siteConfig } from "@/lib/site";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = blogPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: siteConfig.name },
    publisher: { "@type": "Organization", name: siteConfig.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title },
        ]}
      />

      <article className="container-site py-14 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
            {post.category}
          </span>
          <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">{post.title}</h1>
          <div className="mt-3 flex items-center gap-3 text-sm text-dark/50">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
          <div className="mt-8 flex flex-col gap-5 text-dark/75">
            {post.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </article>

      {related.length ? (
        <section className="bg-blush py-14 sm:py-20">
          <div className="container-site">
            <h2 className="text-2xl font-bold text-ink">Related Reading</h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/blog/${item.slug}`}
                  className="rounded-2xl bg-white p-6 shadow-sm transition-transform hover:-translate-y-1"
                >
                  <h3 className="font-bold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm text-dark/65">{item.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CtaSection
        title="Taste the Amodha Difference"
        description="Explore our dairy range and Mithaiwallah Sweet Corner catalog."
        primaryCta={{ label: "Dairy Products", href: "/dairy-products" }}
        secondaryCta={{ label: "Sweet Corner", href: "/sweet-corner" }}
      />
    </>
  );
}
