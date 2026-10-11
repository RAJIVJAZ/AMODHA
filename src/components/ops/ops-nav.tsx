"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallAppButton, OpsAppBoot } from "@/components/ops/app-install";
import { Icon, type IconName } from "@/components/ops/icons";
import { createClient } from "@/lib/supabase/client";

export type NavGroup = { label: string; items: { href: string; label: string }[] };
export type AppTab = { href: string; label: string; icon: IconName; match: string[] };
export type QuickAction = { href: string; label: string; hint: string; icon: IconName };

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The business app's frame. Desktop: a sidebar with every section. Phone: a top bar, a bottom tab
 * bar with the person's main jobs, a "+" button for quick actions, and "More" for everything else.
 */
export function OpsNav({ groups, user, tabs, actions }: { groups: NavGroup[]; user: { name: string; role: string }; tabs: AppTab[]; actions: QuickAction[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState<"more" | "actions" | null>(null);
  const isActive = (href: string) => (href === "/ops" ? pathname === "/ops" : matches(pathname, href));

  // Close any open sheet when the page changes.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setSheet(null);
  }
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login?next=/ops/today");
    router.refresh();
  }

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
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-semibold lg:py-2 ${
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

  const userBlock = (
    <div className="text-xs text-white/60">
      <p className="font-semibold text-white">{user.name}</p>
      <p>{user.role}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="hover:text-white">
          Website
        </Link>
        <Link href="/account" className="hover:text-white">
          My account
        </Link>
        <button type="button" onClick={signOut} className="hover:text-white">
          Sign out
        </button>
      </div>
    </div>
  );

  const initials =
    user.name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "MW";

  return (
    <>
      <OpsAppBoot />

      {/* Phone: top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white lg:hidden">
        <Link href="/ops/today" className="font-heading text-lg font-bold">
          Mithai Wallah <span className="text-primary-light">Ops</span>
        </Link>
        <button
          type="button"
          onClick={() => setSheet(sheet === "more" ? null : "more")}
          aria-expanded={sheet === "more"}
          aria-label="Menu and account"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold"
        >
          {initials}
        </button>
      </header>

      {/* Phone: everything else */}
      {sheet === "more" ? (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink px-3 pb-28 pt-4 text-white lg:hidden">
          <div className="mb-4 flex items-center justify-between px-3">
            <p className="font-heading text-lg font-bold">Menu</p>
            <button type="button" onClick={() => setSheet(null)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold">
              Close
            </button>
          </div>
          <InstallAppButton className="mb-5 px-1" />
          {links}
          <a href="/downloads/mw-ops.apk" download className="mx-3 mt-6 block rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
            🤖 Download the Android app (APK)
            <span className="mt-0.5 block text-xs font-normal text-white/60">For staff phones. Allow &ldquo;install unknown apps&rdquo; when asked.</span>
          </a>
          <div className="mt-6 border-t border-white/10 px-3 pt-4">{userBlock}</div>
        </div>
      ) : null}

      {/* Phone: quick actions */}
      {sheet === "actions" ? (
        <div className="fixed inset-0 z-[56] flex flex-col justify-end bg-ink/50 lg:hidden" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick actions"
            onClick={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <p className="font-heading text-lg font-bold text-ink">Quick actions</p>
              <button type="button" onClick={() => setSheet(null)} className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm font-semibold text-ink">
                Close
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <li key={a.href + a.label}>
                  <Link href={a.href} className="flex h-full flex-col gap-1 rounded-2xl border-2 border-ink/10 bg-[#f5f6f7] p-3 active:bg-primary-light/40">
                    <Icon name={a.icon} className="h-6 w-6 text-primary-dark" />
                    <span className="text-sm font-bold text-ink">{a.label}</span>
                    <span className="text-xs text-dark/55">{a.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {actions.length ? (
        <button
          type="button"
          onClick={() => setSheet(sheet === "actions" ? null : "actions")}
          aria-label="Quick actions"
          aria-expanded={sheet === "actions"}
          className={`fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-ink/25 lg:hidden ${
            sheet ? "hidden" : ""
          }`}
        >
          <Icon name="plus" className="h-7 w-7" />
        </button>
      ) : null}

      {/* Phone: tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[55] border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {tabs.map((t) => {
            const active = sheet === null && t.match.some((m) => matches(pathname, m));
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-ink" : "text-dark/50"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-primary-light/60" : ""}`}>
                    <Icon name={t.icon} className="h-[22px] w-[22px]" />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSheet(sheet === "more" ? null : "more")}
              aria-expanded={sheet === "more"}
              className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${sheet === "more" ? "text-ink" : "text-dark/50"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${sheet === "more" ? "bg-primary-light/60" : ""}`}>
                <Icon name="more" className="h-[22px] w-[22px]" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-ink px-3 py-5 text-white lg:flex">
        <Link href="/ops/today" className="mb-6 px-3 font-heading text-xl font-bold">
          Mithai Wallah <span className="text-primary-light">Ops</span>
        </Link>
        {links}
        <div className="mt-auto border-t border-white/10 px-3 pt-4">{userBlock}</div>
      </aside>
    </>
  );
}
