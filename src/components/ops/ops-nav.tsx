"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavGroup = { label: string; items: { href: string; label: string }[] };

export function OpsNav({ groups, user }: { groups: NavGroup[]; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/ops" ? pathname === "/ops" : pathname === href || pathname.startsWith(`${href}/`));

  const links = (
    <nav className="flex flex-col gap-5" aria-label="Business app">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-white/45">{g.label}</p>
          <ul className="flex flex-col">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-semibold ${
                    isActive(item.href) ? "bg-white text-ink" : "text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <Link href="/ops" className="font-heading text-lg font-bold">
          Mithai Wallah <span className="text-primary-light">Ops</span>
        </Link>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold" aria-expanded={open}>
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open ? <div className="fixed inset-x-0 bottom-0 top-[52px] z-30 overflow-y-auto bg-ink px-3 py-4 lg:hidden">{links}</div> : null}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-ink px-3 py-5 text-white lg:flex">
        <Link href="/ops" className="mb-6 px-3 font-heading text-xl font-bold">
          Mithai Wallah <span className="text-primary-light">Ops</span>
        </Link>
        {links}
        <div className="mt-auto border-t border-white/10 px-3 pt-4 text-xs text-white/60">
          <p className="font-semibold text-white">{user.name}</p>
          <p>{user.role}</p>
          <div className="mt-2 flex gap-3">
            <Link href="/" className="hover:text-white">
              Website
            </Link>
            <Link href="/account" className="hover:text-white">
              My account
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
