// Shared types and helpers for the B2B staff screens (/ops/b2b/**).
import { param } from "@/lib/ops/format";

export type SearchParams = Record<string, string | string[] | undefined>;

export type QueueRow = {
  id: string;
  order_no: string;
  order_number: number;
  source: string;
  channel: string;
  is_b2b: boolean;
  customer_name: string;
  customer_code: string | null;
  customer_id: string | null;
  phone: string;
  salesperson: string | null;
  entered_by_salesperson: string | null;
  created_at: string;
  total: number;
  payment_method: string;
  payment_status: string;
  requested_delivery_date: string | null;
  delivery_date: string | null;
  stage: string;
  status_label: string;
  priority: string;
  ops_manager: string | null;
  on_hold: boolean;
  approval_reasons: string[] | null;
  confirmation: string;
  invoice_number: string | null;
  lines: { name: string; pack: string; ordered: number; reserved: number; dispatched: number; free_stock: number | null }[];
  stock_ok: boolean;
  fully_reserved: boolean;
};

export type PackingSlip = {
  order: {
    id: string;
    order_no: string;
    created_at: string;
    source: string;
    customer_name: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
    notes: string | null;
    delivery_date: string | null;
    stage: string;
    priority: string;
    customer_code: string | null;
    owner_name: string | null;
  };
  lines: {
    order_item_id: string;
    name: string;
    pack: string;
    sku: string | null;
    pack_size: string | null;
    ordered: number;
    to_pick: number;
    dispatched: number;
    lots: { lot_code: string; batch_no: string | null; batch_id: string | null; expiry_date: string | null; qty: number }[];
    last_packed: number | null;
  }[];
  packing: { at: string; product: string; to_pick: number; packed: number; exception: string | null; by: string | null }[];
};

export type Requirement = {
  item_id: string;
  sku: string;
  name: string;
  product_id: string;
  product: string;
  pack: string | null;
  net_qty: number | null;
  net_unit: string | null;
  unit: string;
  confirmed_demand: number | null;
  reserved: number | null;
  still_to_reserve: number | null;
  free_stock: number;
  additional_required: number;
  additional_required_base: number;
  unconfirmed_demand: number | null;
  earliest_delivery: string | null;
  orders: number;
  in_production_base: number;
  shelf_life_days: number | null;
  lead_days: number;
  priority: string;
  start_by: string | null;
};

export type Performance = {
  salesperson_id: string;
  name: string;
  employee_code: string;
  active: boolean;
  territories: string[];
  leads_added: number;
  customers_acquired: number;
  conversion_pct: number | null;
  assigned_customers: number;
  rep_orders: number;
  rep_sales: number;
  rep_avg_order: number | null;
  direct_orders_from_accounts: number;
  direct_sales_from_accounts: number;
  repeat_customers: number;
  retained_customers: number;
  visits: number;
  outstanding: number | null;
  target: number;
  incentive_pct: number;
  incentive_basis: string;
  incentive: number;
};

export type Breakdown = {
  by_channel: { source: string; orders: number; sales: number }[];
  by_product: { product: string; sku: string; qty: number; sales: number }[];
  by_area: { city: string; locality: string; customers: number; orders: number; sales: number }[];
  by_day: { day: string; sales_rep: number; b2b_app: number; other: number }[];
  totals: { orders: number; sales: number; customers: number; avg_order: number | null };
};

export type Salesperson = {
  id: string;
  user_id: string | null;
  email: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  territories: string[];
  is_active: boolean;
  can_view_outstanding: boolean;
  can_view_credit: boolean;
  incentive_pct: number;
  incentive_basis: string;
};

export type Territory = { code: string; name: string; city: string; localities: string[]; is_active: boolean };

export type Campaign = {
  id: string;
  name: string;
  channel: string;
  segment: string;
  filters: Record<string, unknown> | null;
  message: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
  provider_reference: string | null;
  excluded_no_consent: number;
  excluded_opted_out: number;
};

/** Order queue filters, in the order the tabs show them. */
export const queueFilters: { key: string; label: string }[] = [
  { key: "action", label: "Needs action" },
  { key: "new", label: "New" },
  { key: "sales_rep", label: "Salesperson orders" },
  { key: "b2b_app", label: "Direct B2B" },
  { key: "retail", label: "Retail" },
  { key: "awaiting_confirmation", label: "Awaiting confirmation" },
  { key: "awaiting_stock", label: "Awaiting stock" },
  { key: "awaiting_manufacturing", label: "Awaiting manufacturing" },
  { key: "awaiting_packing", label: "Awaiting packing" },
  { key: "ready", label: "Ready for dispatch" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export const priorities = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

export const priorityTone: Record<string, "bad" | "warn" | "muted" | "info"> = { urgent: "bad", high: "warn", normal: "muted", low: "info" };

export const consentChannels = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Customer-list filters read from the address bar, for the list page and its CSV export. */
export const customerFilterKeys = ["status", "segment", "city", "locality", "salesperson", "customer_type", "product", "last_order_before", "min_value"] as const;

export function customerFilters(get: (key: string) => string | undefined) {
  const f: Record<string, string> = {};
  for (const k of customerFilterKeys) {
    const v = (get(k) ?? "").trim();
    if (!v) continue;
    if (k === "last_order_before" && !DATE.test(v)) continue;
    if (k === "min_value" && !Number.isFinite(Number(v))) continue;
    if ((k === "product" || (k === "salesperson" && v !== "none")) && !UUID.test(v)) continue;
    f[k] = v.slice(0, 80);
  }
  return { search: (get("q") ?? "").trim().slice(0, 80), filters: f };
}

export function fromSearchParams(sp: SearchParams) {
  return (key: string) => param(sp[key]);
}

/** Query string from a record, leaving out empty values. */
export function qs(values: Record<string, string | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const num = (v: number | string | null | undefined) => Number(v ?? 0);

