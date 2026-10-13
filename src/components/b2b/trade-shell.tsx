"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TabIcon = "home" | "order" | "orders" | "account";

const tabs: { href: string; label: string; icon: TabIcon }[] = [
  { href: "/trade", label: "Home", icon: "home" },
  { href: "/trade/quick-order", label: "Quick order", icon: "order" },
  { href: "/trade/orders", label: "Orders", icon: "orders" },
  { href: "/trade/account", label: "Account", icon: "account" },
];

function TabGlyph({ name }: { name: TabIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...common}>
      {name === "home" ? <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" /> : null}
      {name === "order" ? (
        <>
          <path d="M3 4h2.5l2 11h11l2-8H7" />
          <circle cx="9.5" cy="19" r="1.4" />
          <circle cx="17" cy="19" r="1.4" />
        </>
      ) : null}
      {name === "orders" ? (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6" />
        </>
      ) : null}
      {name === "account" ? (
        <>
          <path d="M4 10h16M5 10v10h14V10M3 10l2-6h14l2 6" />
          <path d="M10 20v-5h4v5" />
        </>
      ) : null}
    </svg>
  );
}

const isActive = (pathname: string, href: string) => (href === "/trade" ? pathname === "/trade" : pathname === href || pathname.startsWith(`${href}/`));

/** Registers the Wholesale app's service worker (offline screen only; nothing is cached). */
function TradeBoot() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/trade/sw.js", { scope: "/trade" }).catch(() => {});
    }
  }, []);
  return null;
}

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/trade");
    router.refresh();
  }
  return (
    <button type="button" onClick={signOut} disabled={busy} className={className}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

/** The Wholesale app frame: top bar (desktop nav inside it) and a bottom tab bar on phones. */
export function TradeShell({
  shopName,
  customerCode,
  showTabs,
  signedIn,
  unread,
  children,
}: {
  shopName: string | null;
  customerCode: string | null;
  showTabs: boolean;
  signedIn: boolean;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f4f1] text-dark">
      <TradeBoot />
      <header className="sticky top-0 z-30 bg-ink text-white shadow-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/trade" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
            <span className="font-heading text-base font-bold leading-tight sm:text-lg">Mithai Wallah Wholesale</span>
            {shopName ? (
              <span className="truncate text-xs text-white/70">
                {shopName}
                {customerCode ? ` · ${customerCode}` : ""}
              </span>
            ) : (
              <span className="text-xs text-white/60">Trade ordering for sweet shops</span>
            )}
          </Link>
          {showTabs ? (
            <nav aria-label="Wholesale app" className="hidden items-center gap-1 md:flex">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={isActive(pathname, t.href) ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${
                    isActive(pathname, t.href) ? "bg-white text-ink" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
              <Link href="/trade/catalogue" className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${isActive(pathname, "/trade/catalogue") ? "bg-white text-ink" : "text-white/85 hover:bg-white/10"}`}>
                Catalogue
              </Link>
            </nav>
          ) : null}
          {showTabs && unread > 0 ? (
            <Link href="/trade#notifications" className="flex min-h-11 items-center rounded-full bg-accent px-3 text-xs font-bold text-white" aria-label={`${unread} unread updates`}>
              {unread} new
            </Link>
          ) : null}
          {signedIn ? <SignOutButton className="hidden min-h-11 rounded-lg px-3 text-sm font-semibold text-white/80 hover:bg-white/10 md:block" /> : null}
        </div>
      </header>
      <main id="main-content" className={`mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 ${showTabs ? "pb-28 md:pb-8" : "pb-8"}`}>
        {children}
      </main>
      {showTabs ? (
        <nav
          aria-label="Wholesale app tabs"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-4">
            {tabs.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-primary-dark" : "text-dark/55"}`}
                  >
                    <TabGlyph name={t.icon} />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
