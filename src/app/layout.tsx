import type { Metadata } from "next";
import { Fredoka, Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { CartProvider } from "@/lib/cart-context";
import { siteConfig } from "@/lib/site";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Pure Desi Ghee Sweets in Prayagraj | Mithai Wallah",
    template: "%s | Mithai Wallah",
  },
  description: siteConfig.description,
  keywords: [
    "Pure Desi Ghee Sweets Prayagraj",
    "Best Sweets in Prayagraj",
    "Desi Ghee Mithai",
    "Traditional Indian Sweets",
    "Milk Cake Prayagraj",
    "Kunda Prayagraj",
    "Fresh Milk Delivery Prayagraj",
    "Milk Subscription Prayagraj",
  ],
  authors: [{ name: siteConfig.legalName }],
  creator: siteConfig.legalName,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    title: "Pure Desi Ghee Sweets in Prayagraj | Mithai Wallah",
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: "Pure Desi Ghee Sweets in Prayagraj | Mithai Wallah",
    description: siteConfig.description,
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    slogan: siteConfig.tagline,
    url: siteConfig.url,
    logo: `${siteConfig.url}/logos/mithaiwallah.png`,
    description: siteConfig.description,
    foundingDate: siteConfig.founded,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${siteConfig.address.office.line1}, ${siteConfig.address.office.line2}`,
      addressLocality: siteConfig.address.office.city,
      addressRegion: siteConfig.address.office.state,
      postalCode: siteConfig.address.office.postalCode,
      addressCountry: "IN",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: siteConfig.contact.phone,
        contactType: "customer service",
        email: siteConfig.contact.email,
        areaServed: "IN",
      },
    ],
    sameAs: Object.values(siteConfig.social).filter(Boolean),
  };

  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: siteConfig.name,
    image: `${siteConfig.url}/logos/mithaiwallah.png`,
    url: siteConfig.url,
    areaServed: { "@type": "City", name: "Prayagraj" },
    address: {
      "@type": "PostalAddress",
      streetAddress: `${siteConfig.address.plant.line1}, ${siteConfig.address.plant.line2}`,
      addressLocality: siteConfig.address.plant.city,
      addressRegion: siteConfig.address.plant.state,
      postalCode: siteConfig.address.plant.postalCode,
      addressCountry: "IN",
    },
    telephone: siteConfig.contact.phone,
    servesCuisine: "Indian Sweets",
    priceRange: "₹₹",
  };

  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${fraunces.variable} ${inter.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col bg-white text-[var(--color-dark)]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <CartProvider>
          <AnnouncementBar />
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
