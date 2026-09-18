"use client";

import Link from "next/link";
import { useState } from "react";
import { mainNav, siteConfig } from "@/lib/site";
import { BrandBadge } from "@/components/ui/brand-badge";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gold/20 bg-white/95 backdrop-blur">
      <div className="container-site flex items-center justify-between py-2.5">
        <Link href="/" onClick={() => setIsOpen(false)} aria-label={`${siteConfig.name} home`}>
          <BrandBadge title="Amodha" subtitle="Dairy Products" tone="brown" width={148} height={62} />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-6 text-sm font-medium text-dark/80">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition-colors hover:text-accent-red">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/sweet-corner"
            className="rounded-full bg-accent-red px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-red-dark"
          >
            Sweet Corner
          </Link>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md text-brown lg:hidden"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          onClick={() => setIsOpen((v) => !v)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {isOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <>
                <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {isOpen ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-gold/20 bg-cream lg:hidden">
          <ul className="container-site flex flex-col gap-1 py-4 text-base font-medium text-brown">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-2 py-2.5 hover:bg-white"
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/sweet-corner"
                onClick={() => setIsOpen(false)}
                className="mt-2 block rounded-full bg-accent-red px-4 py-2.5 text-center text-sm font-semibold uppercase tracking-wide text-white"
              >
                Sweet Corner
              </Link>
            </li>
            <li>
              <a
                href={`tel:${siteConfig.contact.phoneHref}`}
                className="block px-2 py-2 text-sm text-dark/60"
              >
                Call {siteConfig.contact.phone}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
