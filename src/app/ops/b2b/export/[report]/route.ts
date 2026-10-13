import { getOps, type Ops, type OpsModule } from "@/lib/ops/context";
import { todayIST } from "@/lib/ops/format";
import type { CustomerRow } from "@/lib/b2b/types";
import { customerFilters, UUID, type Performance } from "../../_lib";

type Cell = string | number | boolean | null | undefined;
type Sheet = { columns: string[]; rows: Cell[][] };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A CSV cell; text a spreadsheet would run as a formula is prefixed with a quote. */
function cell(v: Cell) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function rpc<T>(ops: Ops, fn: string, args: Record<string, unknown>) {
  const { data, error } = await ops.supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const reports: Record<string, { module: OpsModule; build: (ops: Ops, url: URL) => Promise<Sheet> }> = {
  customers: {
    module: "b2b_customers",
    build: async (ops, url) => {
      const { search, filters } = customerFilters((k) => url.searchParams.get(k) ?? undefined);
      const rows = await rpc<CustomerRow[]>(ops, "b2b_customer_list", { p_search: search || null, p_filters: filters, p_limit: 2000 });
      return {
        columns: ["Customer ID", "Shop", "Owner", "Mobile", "Locality", "City", "Type", "Status", "Salesperson", "Price category", "Payment terms", "Orders", "Total ₹", "Last order", "Avg order ₹", "Balance ₹", "Marketing consent", "Segments"],
        rows: rows.map((c) => [c.customer_code, c.shop_name, c.owner_name, c.mobile, c.locality, c.city, c.customer_type, c.status, c.salesperson_name, c.price_category, c.payment_terms, c.orders, c.total_value, c.last_order_at?.slice(0, 10), c.avg_order_value, c.balance, c.marketing_consent, c.segments.join(" ")]),
      };
    },
  },
  campaign: {
    module: "marketing",
    build: async (ops, url) => {
      const id = url.searchParams.get("id") ?? "";
      if (!UUID.test(id)) throw new Error("Choose a campaign");
      const rows = await rpc<{ customer_code: string; shop_name: string; owner_name: string; contact: string | null }[]>(ops, "mkt_campaign_recipients", { p_campaign_id: id });
      return { columns: ["Customer ID", "Shop", "Owner", "Contact"], rows: rows.map((r) => [r.customer_code, r.shop_name, r.owner_name, r.contact]) };
    },
  },
  "sales-performance": {
    module: "sales_team",
    build: async (ops, url) => {
      const today = todayIST();
      const from = DATE.test(url.searchParams.get("from") ?? "") ? (url.searchParams.get("from") as string) : `${today.slice(0, 8)}01`;
      const to = DATE.test(url.searchParams.get("to") ?? "") ? (url.searchParams.get("to") as string) : today;
      const rows = await rpc<Performance[]>(ops, "b2b_sales_performance", { p_from: from, p_to: to });
      return {
        columns: ["Salesperson", "Code", "Leads added", "Customers acquired", "Conversion %", "Entered orders", "Entered sales ₹", "Direct orders from their shops", "Direct sales ₹", "Repeat customers", "Retained customers", "Visits", "Target ₹", "Incentive ₹", "Outstanding ₹"],
        rows: rows.map((r) => [r.name, r.employee_code, r.leads_added, r.customers_acquired, r.conversion_pct, r.rep_orders, r.rep_sales, r.direct_orders_from_accounts, r.direct_sales_from_accounts, r.repeat_customers, r.retained_customers, r.visits, r.target, r.incentive, r.outstanding]),
      };
    },
  },
};

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const def = reports[report];
  if (!def) return new Response("Unknown report", { status: 404 });
  const ops = await getOps();
  if (!ops) return new Response("Please sign in", { status: 401 });
  if (!ops.can(def.module, "export")) return new Response("You do not have permission to export this report", { status: 403 });
  const url = new URL(request.url);
  try {
    const sheet = await def.build(ops, url);
    await ops.supabase.rpc("ops_log_export", { p_report: `b2b-${report}`, p_rows: sheet.rows.length, p_params: Object.fromEntries(url.searchParams) });
    const body = "﻿" + [sheet.columns, ...sheet.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mithaiwallah-b2b-${report}-${todayIST()}.csv"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed", { status: 400 });
  }
}
