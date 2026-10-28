import type { Metadata, Viewport } from "next";
import { OpsNav, type AppTab, type NavGroup, type QuickAction } from "@/components/ops/ops-nav";
import { MonitoringNotice } from "@/components/staff/monitoring-notice";
import { SessionGuard } from "@/components/staff/session-guard";
import { getOps, type Ops, type OpsModule } from "@/lib/ops/context";
import { monitoringSettings } from "@/lib/staff/settings";

export const metadata: Metadata = {
  title: { default: "Mithai Wallah Ops", template: "%s · Mithai Wallah Ops" },
  robots: { index: false, follow: false },
  manifest: "/ops/manifest.webmanifest",
  appleWebApp: { title: "MW Ops", capable: true, statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/ops-192.png" },
};

export const viewport: Viewport = { themeColor: "#16323f", viewportFit: "cover" };

const nav: { label: string; items: { href: string; label: string; module: OpsModule | "*" }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/ops/today", label: "Today", module: "*" },
      { href: "/ops", label: "Dashboard", module: "dashboard" },
    ],
  },
  {
    label: "Factory",
    items: [
      { href: "/ops/production", label: "Production", module: "production" },
      { href: "/ops/procurement/entry", label: "Record milk", module: "procurement" },
      { href: "/ops/procurement", label: "Milk collection register", module: "procurement" },
      { href: "/ops/inventory", label: "Inventory", module: "inventory" },
      { href: "/ops/dispatch", label: "Orders & dispatch", module: "dispatch" },
      { href: "/ops/deliveries", label: "Delivery run", module: "dispatch" },
      { href: "/ops/subscriptions", label: "Milk subscriptions", module: "subscriptions" },
      { href: "/ops/equipment", label: "Machinery & equipment", module: "equipment" },
    ],
  },
  {
    label: "Wholesale (B2B)",
    items: [
      { href: "/ops/b2b", label: "Order operations", module: "dispatch" },
      { href: "/ops/b2b/customers", label: "B2B customers & CRM", module: "b2b_customers" },
      { href: "/ops/b2b/pricing", label: "Wholesale pricing", module: "pricing" },
      { href: "/ops/b2b/team", label: "Sales team", module: "sales_team" },
      { href: "/ops/b2b/planning", label: "Production requirements", module: "production" },
      { href: "/ops/b2b/reports", label: "Sales performance", module: "sales_team" },
      { href: "/ops/b2b/marketing", label: "Marketing & consent", module: "marketing" },
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
      { href: "/ops/admin/documents", label: "Documents & licences", module: "compliance" },
      { href: "/ops/admin/users", label: "Users & roles", module: "users" },
      { href: "/ops/admin/settings", label: "Settings", module: "settings" },
      { href: "/ops/admin/audit", label: "Audit log", module: "audit" },
      { href: "/ops/admin/activity", label: "Staff activity & audit", module: "staff_monitoring" },
      { href: "/ops/policy", label: "Monitoring notice", module: "*" },
    ],
  },
];

// The phone tab bar: Today, then the first three of these the person can use, then "More".
const tabChoices: (AppTab & { show: (ops: Ops) => boolean })[] = [
  { href: "/ops/deliveries", label: "Deliveries", icon: "truck", match: ["/ops/deliveries", "/ops/dispatch"], show: (o) => o.can("dispatch") },
  { href: "/ops/procurement/entry", label: "Milk", icon: "milk", match: ["/ops/procurement"], show: (o) => o.can("procurement") },
  { href: "/ops/production", label: "Production", icon: "pot", match: ["/ops/production"], show: (o) => o.can("production") },
  {
    href: "/ops/finance/sales",
    label: "Money",
    icon: "rupee",
    match: ["/ops/finance"],
    show: (o) => o.can("sales"),
  },
];

const quickActions: (QuickAction & { show: (ops: Ops) => boolean })[] = [
  { href: "/ops/procurement/entry", label: "Record milk", hint: "From a farmer", icon: "milk", show: (o) => o.can("procurement", "create") },
  { href: "/ops/deliveries", label: "Delivery run", hint: "Mark delivered, collect cash", icon: "truck", show: (o) => o.can("dispatch", "edit") },
  { href: "/ops/dispatch/new", label: "Phone order", hint: "Phone or walk-in", icon: "phone", show: (o) => o.can("dispatch", "create") },
  { href: "/ops/b2b?filter=new", label: "New B2B orders", hint: "Accept and allocate", icon: "box", show: (o) => o.can("dispatch", "approve") },
  { href: "/sales", label: "Sales app", hint: "Shops, visits, orders", icon: "phone", show: (o) => o.can("field_sales") },
  { href: "/ops/production/new", label: "Start a batch", hint: "Plan production", icon: "pot", show: (o) => o.can("production", "create") },
  { href: "/ops/subscriptions?tab=bottles", label: "Bottles", hint: "Given, returned, broken", icon: "bottle", show: (o) => o.can("subscriptions") && o.can("dispatch", "edit") },
  { href: "/ops/finance/expenses?tab=new", label: "Add expense", hint: "Bills and spending", icon: "receipt", show: (o) => o.can("expenses", "create") },
  { href: "/ops/finance/sales?tab=actions", label: "Customer payment", hint: "Received against an invoice", icon: "cash", show: (o) => o.can("sales", "create") },
  { href: "/ops/finance/purchases/pay", label: "Pay a supplier", hint: "Farmers and vendors", icon: "rupee", show: (o) => o.can("purchases", "edit") },
  { href: "/ops/inventory", label: "Check stock", hint: "What we have", icon: "box", show: (o) => o.can("inventory") },
  { href: "/ops/equipment", label: "Machine check", hint: "Working or not", icon: "pot", show: (o) => o.can("equipment", "edit") },
];

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const ops = await getOps();
  const groups: NavGroup[] = ops
    ? nav
        .map((g) => ({
          label: g.label,
          items: g.items.filter((i) => i.module === "*" || ops.can(i.module)).map(({ href, label }) => ({ href, label })),
        }))
        .filter((g) => g.items.length > 0)
    : [];
  const name = ops?.profile?.full_name || ops?.profile?.email || "";
  const role = ops?.profile?.is_admin ? "Owner" : ops?.profile?.job_title || "Staff";
  const staff = Boolean(ops && ops.granted.size > 0);
  const tabs: AppTab[] = ops
    ? [
        { href: "/ops/today", label: "Today", icon: "today", match: ["/ops/today"] },
        ...tabChoices
          .filter((t) => t.show(ops))
          .slice(0, 3)
          .map(({ href, label, icon, match }) => ({ href, label, icon, match })),
      ]
    : [];
  const actions: QuickAction[] = ops ? quickActions.filter((a) => a.show(ops)).map(({ href, label, hint, icon }) => ({ href, label, hint, icon })) : [];

  const session = ops?.session;
  const live = staff && session?.state === "active";
  const needsNotice = live && !session?.acknowledged;
  const { retentionDays } = needsNotice && ops ? await monitoringSettings(ops.supabase) : { retentionDays: 365 };

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f7] lg:flex-row">
      {staff ? <OpsNav groups={groups} user={{ name, role }} tabs={tabs} actions={actions} /> : null}
      <main id="main-content" className={`min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:pb-6 ${staff ? "pb-36" : ""}`}>
        {needsNotice ? (
          <MonitoringNotice version={session?.policy_version ?? "1"} timeoutMinutes={Math.round((session?.timeout_seconds ?? 300) / 60)} retentionDays={retentionDays} acknowledged={false} />
        ) : (
          children
        )}
      </main>
      {live ? <SessionGuard timeoutSeconds={session?.timeout_seconds ?? 300} warningSeconds={session?.warning_seconds ?? 30} /> : null}
    </div>
  );
}
