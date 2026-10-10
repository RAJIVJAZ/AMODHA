import type { Metadata, Viewport } from "next";
import { OpsNav, type NavGroup } from "@/components/ops/ops-nav";
import { getOps, type OpsModule } from "@/lib/ops/context";

export const metadata: Metadata = {
  title: { default: "Mithai Wallah Ops", template: "%s · Mithai Wallah Ops" },
  robots: { index: false, follow: false },
  manifest: "/ops/manifest.webmanifest",
  appleWebApp: { title: "MW Ops", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#16323f" };

const nav: { label: string; items: { href: string; label: string; module: OpsModule }[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/ops", label: "Dashboard", module: "dashboard" }],
  },
  {
    label: "Factory",
    items: [
      { href: "/ops/production", label: "Production", module: "production" },
      { href: "/ops/procurement", label: "Milk collection", module: "procurement" },
      { href: "/ops/inventory", label: "Inventory", module: "inventory" },
      { href: "/ops/dispatch", label: "Orders & dispatch", module: "dispatch" },
      { href: "/ops/subscriptions", label: "Milk subscriptions", module: "subscriptions" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/ops/finance/purchases", label: "Purchases", module: "purchases" },
      { href: "/ops/finance/sales", label: "Sales & receivables", module: "sales" },
      { href: "/ops/finance/expenses", label: "Expenses", module: "expenses" },
      { href: "/ops/finance/payroll", label: "Payroll", module: "payroll" },
      { href: "/ops/finance/banking", label: "Cash & bank", module: "banking" },
      { href: "/ops/finance/reports", label: "Financial reports", module: "reports" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/ops/catalog", label: "Products & recipes", module: "catalog" },
      { href: "/ops/reports", label: "Operational reports", module: "dashboard" },
      { href: "/ops/admin/users", label: "Users & roles", module: "users" },
      { href: "/ops/admin/settings", label: "Settings", module: "settings" },
      { href: "/ops/admin/audit", label: "Audit log", module: "audit" },
    ],
  },
];

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const ops = await getOps();
  const groups: NavGroup[] = ops
    ? nav
        .map((g) => ({ label: g.label, items: g.items.filter((i) => ops.can(i.module)).map(({ href, label }) => ({ href, label })) }))
        .filter((g) => g.items.length > 0)
    : [];
  const name = ops?.profile?.full_name || ops?.profile?.email || "";
  const role = ops?.profile?.is_admin ? "Owner" : ops?.profile?.job_title || "Staff";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f7] lg:flex-row">
      {groups.length > 0 ? <OpsNav groups={groups} user={{ name, role }} /> : null}
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
