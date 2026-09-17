# Amodha Dairy Products & Mithaiwallah Sweet Corner

Marketing website for Amodha Dairy Products and its sweets brand, Mithaiwallah Sweet Corner —
a dairy and mithai manufacturer based in Prayagraj, Uttar Pradesh, serving retail, wholesale,
corporate gifting and wedding gifting customers.

This is the **Phase 1 marketing site**: a production-ready public website with no backend,
database, authentication or portals. Enquiries (wholesale, corporate gifting, wedding gifting,
contact) are captured via forms that hand off to WhatsApp and email — there is no server-side
order/lead storage yet.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- `next/font` with Playfair Display, Cormorant Garamond and Inter

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

- `src/app/` — routes (one folder per page; `[slug]` routes for dairy products, sweets, blog posts)
- `src/components/layout/` — header, footer, WhatsApp button, legal page layout
- `src/components/ui/` — shared UI primitives (buttons, cards, forms, FAQ accordion, CTA sections)
- `src/data/` — site content as typed data (dairy products, sweets, testimonials, blog posts, FAQs)
- `src/lib/site.ts` — site-wide config: business info, nav, contact details, social links

## Content & Design

- Color system, typography and copy follow the brand brief: gold/brown/cream palette,
  Playfair Display headings, Cormorant Garamond subheadings, Inter body text.
- No photography/video assets were supplied, so hero and feature sections use CSS-based
  gradients/patterns rather than placeholder stock photos. Swap in real facility/product
  photography and drone/factory-tour video via the marked hero and gallery sections.
- Update business details (address, phone, WhatsApp number, socials, map) in `src/lib/site.ts`.

## SEO

- Per-page metadata, Open Graph tags, and JSON-LD (Organization, FoodEstablishment, Product,
  Article, FAQPage) are wired up per route.
- `src/app/sitemap.ts` and `src/app/robots.ts` generate `/sitemap.xml` and `/robots.txt`.

## Not in Scope (Phase 1)

Per the original brief, the following are large, separate efforts not built in this pass:
AI gift-box configurator, dealer/distributor/customer portals, admin/ERP dashboard, database
schema, authentication, payments, and AWS infrastructure.

## Build

```bash
npm run build
npm run lint
```
