"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { staffSignOut } from "@/components/staff/session-guard";

const tabs = [
  { href: "/sales", label: "Home", icon: "🏠", exact: true },
  { href: "/sales/customers", label: "Shops", icon: "🏪" },
  { href: "/sales/order", label: "Order", icon: "＋", primary: true },
  { href: "/sales/orders", label: "Orders", icon: "📦" },
  { href: "/sales/catalogue", label: "Products", icon: "🍬" },
];

/** Phone-first frame for the Sales app: top bar and a bottom tab bar with the big Order button. */
export function SalesNav({ name, code }: { name: string; code: string }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  async function signOut() {
    await staffSignOut("manual");
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white">
        <Link href="/sales" className="font-heading text-lg font-bold">
          Mithai Wallah <span className="text-primary-light">Sales</span>
        </Link>
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-full bg-white/15 px-3 text-sm font-semibold">{code}</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-3 text-sm text-ink shadow-xl">
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-dark/60">{code}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/ops/today" className="font-semibold text-primary-dark">
                Business app (Ops)
              </Link>
              <a href="/downloads/mw-sales.apk" download className="font-semibold text-primary-dark">
                Android app (download)
              </a>
              <button type="button" onClick={signOut} className="text-left font-semibold text-accent-dark">
                Sign out
              </button>
            </div>
          </div>
        </details>
      </header>
      <nav aria-label="Sales app" className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((t) => {
            const on = active(t.href, t.exact);
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? "text-ink" : "text-dark/50"}`}
                >
                  {t.primary ? (
                    <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white shadow-lg">{t.icon}</span>
                  ) : (
                    <span className={`flex h-7 w-12 items-center justify-center rounded-full text-lg ${on ? "bg-primary-light/60" : ""}`} aria-hidden="true">
                      {t.icon}
                    </span>
                  )}
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
