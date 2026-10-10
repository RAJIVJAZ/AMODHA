import { getOps, type Ops, type OpsModule } from "@/lib/ops/context";
import { todayIST } from "@/lib/ops/format";

type Cell = string | number | boolean | null | undefined;
type Sheet = { columns: string[]; rows: Cell[][] };
type Params = { from: string; to: string; date: string; view: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A CSV cell. Text that a spreadsheet would run as a formula is prefixed with a quote. */
function cell(v: Cell) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv({ columns, rows }: Sheet) {
  return "﻿" + [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

async function rpc<T>(ops: Ops, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await ops.supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

const reports: Record<string, { module: OpsModule; build: (ops: Ops, p: Params) => Promise<Sheet> }> = {
  "milk-collections": {
    module: "procurement",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { suppliers: { name: string; code: string } | null }>(
        ops.supabase
          .from("milk_collections")
          .select("collection_no, collected_on, shift, qty_received, qty_rejected, qty_accepted, fat_pct, snf_pct, temperature_c, rate_per_litre, amount, amount_paid, payment_status, status, quality_flags, suppliers(name, code)")
          .gte("collected_on", p.from)
          .lte("collected_on", p.to)
          .order("collected_on")
          .order("shift")
      );
      return {
        columns: ["Collection", "Date", "Shift", "Farmer code", "Farmer", "Received L", "Rejected L", "Accepted L", "Fat %", "SNF %", "Temp °C", "Rate ₹/L", "Amount ₹", "Paid ₹", "Payment", "Status", "Quality flags"],
        rows: list.map((c) => [c.collection_no, c.collected_on, c.shift, c.suppliers?.code, c.suppliers?.name, c.qty_received, c.qty_rejected, c.qty_accepted, c.fat_pct, c.snf_pct, c.temperature_c, c.rate_per_litre, c.amount, c.amount_paid, c.payment_status, c.status, String(c.quality_flags ?? "")]),
      };
    },
  },
  stock: {
    module: "inventory",
    build: async (ops, p) => {
      let q = ops.supabase.from("v_stock_summary").select("code, name, item_type, unit, on_hand, reserved, available, stock_value, reorder_level, expired_qty, near_expiry_qty, next_expiry").eq("is_active", true);
      if (p.view && ["raw_material", "packaging", "finished_good", "purchased_good", "consumable"].includes(p.view)) q = q.eq("item_type", p.view);
      const list = await rows<Record<string, Cell>>(q.order("item_type").order("name"));
      return {
        columns: ["Code", "Item", "Type", "Unit", "On hand", "Reserved", "Available", "Value ₹", "Reorder level", "Expired", "Near expiry", "Next expiry"],
        rows: list.map((i) => [i.code, i.name, i.item_type, i.unit, i.on_hand, i.reserved, i.available, i.stock_value, i.reorder_level, i.expired_qty, i.near_expiry_qty, i.next_expiry]),
      };
    },
  },
  "dispatch-sheet": {
    module: "dispatch",
    build: async (ops, p) => {
      const queue = await rows<Record<string, Cell> & { id: string; total: number; payment_method: string }>(
        ops.supabase.from("v_dispatch_queue").select("*").lte("due_date", p.date).order("milk_subscriber", { ascending: false }).order("due_date").order("order_number")
      );
      const items = queue.length
        ? await rows<{ order_id: string; product_name: string; pack_label: string; quantity: number }>(
            ops.supabase.from("order_items").select("order_id, product_name, pack_label, quantity").in("order_id", queue.map((o) => o.id))
          )
        : [];
      const lines = new Map<string, string[]>();
      for (const i of items) lines.set(i.order_id, [...(lines.get(i.order_id) ?? []), `${i.quantity} × ${i.product_name} ${i.pack_label}`]);
      return {
        columns: ["Order", "Due", "Slot", "Subscriber", "Customer", "Phone", "Address", "Pincode", "Items", "Collect ₹", "Status", "On hold", "Notes"],
        rows: queue.map((o) => [o.order_number, o.due_date, o.delivery_slot, o.milk_subscriber ? "yes" : "", o.customer_name, o.phone, o.address, o.pincode, (lines.get(o.id) ?? []).join("; "),
          o.payment_method === "cod" ? o.total : 0, o.fulfilment_status, o.on_hold ? String(o.hold_reason ?? "yes") : "", o.notes]),
      };
    },
  },
  "production-batches": {
    module: "production",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { products: { name: string } | null }>(
        ops.supabase
          .from("production_batches")
          .select("batch_no, production_date, shift, status, planned_qty, output_qty, finished_qty, rejected_qty, rework_qty, process_loss_qty, yield_pct, yield_flag, qc_decision, material_cost, packaging_cost, labour_cost, overhead_cost, total_cost, cost_per_unit, released_at, products(name)")
          .gte("production_date", p.from)
          .lte("production_date", p.to)
          .order("production_date")
          .order("batch_no")
      );
      return {
        columns: ["Batch", "Date", "Shift", "Product", "Status", "Planned", "Output", "Finished", "Rejected", "Rework", "Process loss", "Yield %", "Low yield", "QC", "Materials ₹", "Packaging ₹", "Labour ₹", "Overhead ₹", "Total cost ₹", "Cost per unit ₹", "Released"],
        rows: list.map((b) => [b.batch_no, b.production_date, b.shift, b.products?.name, b.status, b.planned_qty, b.output_qty, b.finished_qty, b.rejected_qty, b.rework_qty, b.process_loss_qty, b.yield_pct,
          b.yield_flag ? "yes" : "", b.qc_decision, b.material_cost, b.packaging_cost, b.labour_cost, b.overhead_cost, b.total_cost, b.cost_per_unit, b.released_at]),
      };
    },
  },
  "subscription-deliveries": {
    module: "subscriptions",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { subscription_delivery_lines: { line_type: string; qty: number; unit_price: number; items: { name: string } | null }[] }>(
        ops.supabase
          .from("subscription_deliveries")
          .select("delivery_date, slot, status, customer_name, phone, address, pincode, skip_reason, subscription_delivery_lines(line_type, qty, unit_price, items(name))")
          .eq("delivery_date", p.date)
          .order("pincode")
          .order("slot")
      );
      return {
        columns: ["Date", "Slot", "Status", "Customer", "Phone", "Address", "Pincode", "Items", "Value ₹", "Skip reason"],
        rows: list.map((d) => [d.delivery_date, d.slot, d.status, d.customer_name, d.phone, d.address, d.pincode,
          d.subscription_delivery_lines.map((l) => `${l.qty} × ${l.items?.name}${l.line_type === "subscription" ? "" : ` (${l.line_type})`}`).join("; "),
          d.subscription_delivery_lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0), d.skip_reason]),
      };
    },
  },
  "sales-register": {
    module: "sales",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { order_items: { quantity: number; unit_price: number; gst_rate: number | null }[] }>(
        ops.supabase
          .from("orders")
          .select("invoice_number, invoice_date, order_number, customer_name, phone, city, pincode, source, subtotal, delivery_fee, discount, total, payment_method, payment_status, fulfilment_status, order_items(quantity, unit_price, gst_rate)")
          .not("invoice_number", "is", null)
          .gte("invoice_date", `${p.from}T00:00:00+05:30`)
          .lte("invoice_date", `${p.to}T23:59:59+05:30`)
          .order("invoice_date")
      );
      return {
        columns: ["Invoice", "Invoice date", "Order", "Customer", "Phone", "City", "Pincode", "Source", "Items ₹", "Delivery ₹", "Discount ₹", "Total ₹", "GST rate(s)", "Payment", "Payment status", "Delivery status"],
        rows: list.map((o) => [o.invoice_number, String(o.invoice_date ?? "").slice(0, 10), o.order_number, o.customer_name, o.phone, o.city, o.pincode, o.source, o.subtotal, o.delivery_fee, o.discount, o.total,
          [...new Set(o.order_items.map((i) => `${Number(i.gst_rate ?? 0)}%`))].join(" "), o.payment_method, o.payment_status, o.fulfilment_status]),
      };
    },
  },
  "purchase-register": {
    module: "purchases",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { suppliers: { name: string; gstin: string | null } | null }>(
        ops.supabase
          .from("purchase_invoices")
          .select("purchase_no, invoice_no, invoice_date, due_date, is_interstate, taxable_total, tax_total, freight, other_charges, round_off, total, amount_paid, status, suppliers(name, gstin)")
          .gte("invoice_date", p.from)
          .lte("invoice_date", p.to)
          .order("invoice_date")
      );
      return {
        columns: ["Our no.", "Supplier", "Supplier GSTIN", "Their bill", "Bill date", "Due", "Inter-state", "Taxable ₹", "GST ₹", "Freight ₹", "Other ₹", "Round off ₹", "Total ₹", "Paid ₹", "Status"],
        rows: list.map((i) => [i.purchase_no, i.suppliers?.name, i.suppliers?.gstin, i.invoice_no, i.invoice_date, i.due_date, i.is_interstate ? "yes" : "", i.taxable_total, i.tax_total, i.freight, i.other_charges, i.round_off, i.total, i.amount_paid, i.status]),
      };
    },
  },
  expenses: {
    module: "expenses",
    build: async (ops, p) => {
      const list = await rows<Record<string, Cell> & { expense_categories: { label: string } | null }>(
        ops.supabase
          .from("expenses")
          .select("expense_no, expense_date, payee, description, amount, gst_amount, paid_from, payment_method, reference, status, expense_categories(label)")
          .gte("expense_date", p.from)
          .lte("expense_date", p.to)
          .order("expense_date")
      );
      return {
        columns: ["No.", "Date", "Category", "Paid to", "Description", "Amount ₹", "GST ₹", "Paid from", "Method", "Reference", "Status"],
        rows: list.map((e) => [e.expense_no, e.expense_date, e.expense_categories?.label, e.payee, e.description, e.amount, e.gst_amount, e.paid_from, e.payment_method, e.reference, e.status]),
      };
    },
  },
  "profit-and-loss": {
    module: "reports",
    build: async (ops, p) => {
      const pl = await rpc<{ lines: { code: string; name: string; type: string; subtype: string | null; amount: number }[]; net_sales: number; cost_of_goods_sold: number; gross_profit: number; operating_expenses: number; operating_profit: number }>(
        ops,
        "fin_profit_and_loss",
        { p_from: p.from, p_to: p.to }
      );
      return {
        columns: ["Section", "Account", "Name", "Amount ₹"],
        rows: [
          ...pl.lines.map((l) => [l.type === "income" ? "Income" : l.subtype === "cogs" ? "Cost of goods sold" : "Operating expenses", l.code, l.name, l.amount]),
          ["Total", "", "Net sales", pl.net_sales],
          ["Total", "", "Cost of goods sold", pl.cost_of_goods_sold],
          ["Total", "", "Gross profit", pl.gross_profit],
          ["Total", "", "Operating expenses", pl.operating_expenses],
          ["Total", "", "Operating profit", pl.operating_profit],
        ],
      };
    },
  },
  "trial-balance": {
    module: "reports",
    build: async (ops, p) => {
      const tb = await rpc<{ account_code: string; name: string; type: string; debit: number; credit: number; balance: number }[]>(ops, "fin_trial_balance", { p_to: p.to });
      return { columns: ["Account", "Name", "Type", "Debits ₹", "Credits ₹", "Balance ₹ (Dr +)"], rows: tb.map((r) => [r.account_code, r.name, r.type, r.debit, r.credit, r.balance]) };
    },
  },
  "product-margins": {
    module: "reports",
    build: async (ops, p) => {
      const m = await rpc<{ code: string; name: string; units_dispatched: number; sales_value: number; cost_value: number; gross_margin: number; margin_pct: number | null }[]>(ops, "fin_product_margins", { p_from: p.from, p_to: p.to });
      return {
        columns: ["Code", "Product", "Units", "Sales ex-GST ₹", "Cost ₹", "Gross margin ₹", "Margin %"],
        rows: m.map((r) => [r.code, r.name, r.units_dispatched, r.sales_value, r.cost_value, r.gross_margin, r.margin_pct]),
      };
    },
  },
  "gst-summary": {
    module: "reports",
    build: async (ops, p) => {
      const g = await rpc<Record<string, number>>(ops, "fin_gst_summary", { p_from: p.from, p_to: p.to });
      return {
        columns: ["", "CGST ₹", "SGST ₹", "IGST ₹"],
        rows: [
          ["Output (on sales)", g.output_cgst, g.output_sgst, g.output_igst],
          ["Input (on purchases)", g.input_cgst, g.input_sgst, g.input_igst],
        ],
      };
    },
  },
  "audit-log": {
    module: "audit",
    build: async (ops, p) => {
      const list = await rpc<{ at: string; actor_name: string | null; action: string; entity: string; entity_id: string | null; details: unknown; reason: string | null }[]>(ops, "ops_audit_log", {
        p_from: p.from,
        p_to: p.to,
        p_limit: 1000,
      });
      return {
        columns: ["When", "Who", "Action", "Record", "Record id", "Details", "Reason"],
        rows: list.map((a) => [a.at, a.actor_name, a.action, a.entity, a.entity_id, a.details ? JSON.stringify(a.details) : "", a.reason]),
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
  const today = todayIST();
  const pick = (k: string, fallback: string) => {
    const v = url.searchParams.get(k);
    return v && DATE.test(v) ? v : fallback;
  };
  const p: Params = { from: pick("from", `${today.slice(0, 8)}01`), to: pick("to", today), date: pick("date", today), view: url.searchParams.get("view") };

  try {
    const sheet = await def.build(ops, p);
    await ops.supabase.rpc("ops_log_export", { p_report: report, p_rows: sheet.rows.length, p_params: { from: p.from, to: p.to, date: p.date, view: p.view } });
    const name = `mithaiwallah-${report}-${report === "dispatch-sheet" || report === "subscription-deliveries" ? p.date : `${p.from}-to-${p.to}`}.csv`;
    return new Response(csv(sheet), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed", { status: 400 });
  }
}
