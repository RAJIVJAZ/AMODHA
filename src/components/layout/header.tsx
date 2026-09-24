"use client";

import Link from "next/link";
import { useState } from "react";
import { mainNav, siteConfig } from "@/lib/site";
import { Logo } from "@/components/ui/logo";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b-[2.5px] border-ink bg-white">
      <div className="container-site flex items-center justify-between py-3">
        <Link href="/" onClick={() => setIsOpen(false)} aria-label={`${siteConfig.name} home`}>
          <Logo size="md" />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="font-heading flex items-center gap-6 text-sm font-semibold text-ink">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition-colors hover:text-primary-dark">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/contact"
              className="font-heading sticker-shadow rounded-full border-[2.5px] border-ink bg-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)]"
            >
              Order Enquiry
            </Link>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink lg:hidden"
            aria-expanded={isOpen}
            aria-controls="mobile-nav"
            aria-label={isOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {isOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M4 7h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {isOpen ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t-[2.5px] border-ink bg-blush lg:hidden">
          <ul className="font-heading container-site flex flex-col gap-1 py-4 text-base font-semibold text-ink">
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
                href="/contact"
                onClick={() => setIsOpen(false)}
                className="sticker-shadow mt-2 block rounded-full border-[2.5px] border-ink bg-accent px-4 py-2.5 text-center text-sm font-semibold uppercase tracking-wide text-white"
              >
                Order Enquiry
              </Link>
            </li>
            <li>
              <a
                href={`tel:${siteConfig.contact.phoneHref}`}
                className="font-sans block px-2 py-2 text-sm font-normal text-dark/60"
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
