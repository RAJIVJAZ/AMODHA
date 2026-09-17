import Link from "next/link";
import { footerNav, siteConfig } from "@/lib/site";

const socialLinks = [
  { label: "Instagram", href: siteConfig.social.instagram },
  { label: "Facebook", href: siteConfig.social.facebook },
  { label: "YouTube", href: siteConfig.social.youtube },
  { label: "LinkedIn", href: siteConfig.social.linkedin },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gold-light">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-cream/80 transition-colors hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-brown text-cream">
      <div className="container-site grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-2">
          <span className="font-heading text-2xl font-bold text-white">Amodha</span>
          <p className="font-subheading mt-1 italic text-gold-light">{siteConfig.sweetBrand}</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/80">
            Premium dairy products and handcrafted sweets, manufactured in Prayagraj using traditional
            methods and modern hygiene standards.
          </p>
          <address className="mt-5 not-italic text-sm leading-relaxed text-cream/80">
            {siteConfig.address.line1}
            <br />
            {siteConfig.address.line2}, {siteConfig.address.city}, {siteConfig.address.state} -{" "}
            {siteConfig.address.postalCode}
          </address>
          <a
            href={siteConfig.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-gold-light hover:text-white"
          >
            View on Google Maps →
          </a>
          <ul className="mt-6 flex gap-4">
            {socialLinks.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cream/80 hover:text-white"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <FooterColumn title="Dairy Products" links={footerNav.products} />
        <FooterColumn title="Sweet Corner" links={footerNav.sweets} />
        <FooterColumn title="Business" links={footerNav.business} />
        <div>
          <FooterColumn title="Company" links={footerNav.company} />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-site flex flex-col items-center justify-between gap-3 py-6 text-xs text-cream/60 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {footerNav.legal.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p>
            <a href={`tel:${siteConfig.contact.phoneHref}`} className="hover:text-white">
              {siteConfig.contact.phone}
            </a>{" "}
            ·{" "}
            <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-white">
              {siteConfig.contact.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
