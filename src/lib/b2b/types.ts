// Shapes returned by the B2B database functions (supabase/migrations/20261013100000_b2b_sales_wholesale.sql).

export type CatalogueItem = {
  item_id: string;
  code: string;
  name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  category: string;
  category_label: string | null;
  image_url: string | null;
  storefront_slug: string | null;
  description: string | null;
  shelf_life_days: number | null;
  storage: string | null;
  pack: string | null;
  pack_type: string | null;
  net_qty: number | null;
  net_unit: string | null;
  unit: string;
  hsn: string | null;
  gst_rate: number;
  min_qty: number;
  multiple: number;
  lead_days: number;
  price: number | null;
  list_price: number | null;
  price_source: string | null;
  breaks: { min_qty: number; price: number }[] | null;
  offers: { price: number; min_qty: number; valid_to: string | null; note: string | null }[] | null;
  availability: "in_stock" | "limited" | "made_to_order";
  available_qty: number | null;
};

export type QuoteLine = {
  item_id: string;
  code: string;
  name: string;
  product_name: string;
  pack: string | null;
  unit: string;
  qty: number;
  unit_price: number;
  list_price: number;
  price_source: string;
  line_total: number;
  savings: number;
  gst_rate: number;
  available: number;
  in_stock: boolean;
};

export type Credit = {
  payment_terms: string;
  credit_status: string;
  credit_days: number;
  credit_limit?: number;
  balance?: number;
  not_invoiced?: number;
  exposure?: number;
  available?: number;
  overdue?: number;
};

export type Quote = {
  lines: QuoteLine[];
  errors: { item_id?: string; error: string }[];
  shortages: { item_id: string; name: string; ordered: number; available: number; short: number }[];
  subtotal: number;
  list_total: number;
  savings: number;
  delivery_fee: number;
  total: number;
  gst_included: number;
  earliest_delivery: string;
  stock_lead_days: number;
  credit?: Credit | null;
};

export type PlaceOrderResult = {
  order_id: string;
  order_no: string;
  status: string;
  total: number;
  approval_reasons: string[];
  shortages?: Quote["shortages"];
  needs_confirmation?: boolean;
  duplicate?: boolean;
};

export type OrderListRow = {
  id: string;
  order_no: string;
  created_at: string;
  customer_id: string;
  shop_name: string;
  customer_code: string;
  source: string;
  entered_by_me: boolean | null;
  total: number;
  status: string;
  stage: string;
  confirmation: string;
  requested_delivery_date: string | null;
  delivery_date: string | null;
  payment_method: string;
  invoice_number: string | null;
  items: { name: string; qty: number }[];
};

export type OrderDetail = {
  access: "staff" | "salesperson" | "customer";
  order: {
    id: string;
    order_no: string;
    order_number: number;
    created_at: string;
    source: string;
    status: string;
    stage: string;
    confirmation: string;
    on_hold: boolean;
    subtotal: number;
    delivery_fee: number;
    total: number;
    payment_method: string;
    payment_status: string;
    paid_recorded: number;
    requested_delivery_date: string | null;
    delivery_date: string | null;
    notes: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    amendment_count: number;
    cancel_reason: string | null;
    approval_reasons: string[] | null;
    priority: string;
    delivery_address: string;
    city: string;
    pincode: string;
    entered_by: string | null;
    entered_by_me: boolean;
  };
  customer: { id: string; customer_code: string; shop_name: string; owner_name: string; mobile: string; gstin: string | null; business_address: string | null };
  lines: {
    order_item_id: string;
    item_id: string | null;
    name: string;
    pack: string;
    code: string | null;
    qty: number;
    unit_price: number;
    list_price: number | null;
    line_total: number;
    gst_rate: number | null;
    dispatched: number | null;
    reserved: number | null;
  }[];
  events: { at: string; status: string; label: string; note: string | null }[];
  dispatches: { dispatch_no: string; status: string; dispatched_at: string; expected_at: string | null; delivered_at: string | null; delivery_person: string | null }[];
  amendments: { no: number; at: string; reason: string; before: AmendDoc; after: AmendDoc; by: string | null }[] | null;
};

export type AmendDoc = { total: number; lines: { item_id: string; name: string; qty: number; unit_price: number }[]; requested_delivery_date?: string | null };

export type CustomerRow = {
  id: string;
  customer_code: string;
  shop_name: string;
  owner_name: string;
  mobile: string;
  whatsapp: string | null;
  locality: string | null;
  city: string;
  customer_type: string;
  status: string;
  source: string;
  assigned_salesperson: string | null;
  salesperson_name: string | null;
  price_category: string;
  payment_terms: string;
  next_follow_up: string | null;
  acquired_at: string;
  marketing_consent: boolean;
  orders: number;
  total_value: number;
  last_order_at: string | null;
  open_orders: number;
  avg_order_value: number | null;
  orders_per_month: number;
  balance: number | null;
  credit_limit: number | null;
  segments: string[];
};

export type Customer = {
  id: string;
  customer_code: string;
  shop_name: string;
  owner_name: string;
  mobile: string;
  mobile_verified: boolean;
  whatsapp: string | null;
  email: string | null;
  alternate_contact: string | null;
  business_address: string | null;
  delivery_address: string | null;
  locality: string | null;
  city: string;
  pincode: string | null;
  gstin: string | null;
  customer_type: string;
  status: string;
  source: string;
  assigned_salesperson: string | null;
  acquired_by: string | null;
  acquired_at: string;
  approved_at: string | null;
  decision_note: string | null;
  price_category: string;
  payment_terms: string;
  credit_days: number;
  credit_limit?: number;
  credit_status: string;
  expected_monthly_value: number | null;
  preferred_products: string | null;
  business_notes: string | null;
  photo_url: string | null;
  next_follow_up: string | null;
  last_visit_at: string | null;
  marketing_consent: boolean;
  consent_channels: string[];
  consent_source: string | null;
  consent_at: string | null;
  opted_out_at: string | null;
  preferred_channel: string;
  callback_requested: boolean;
};

export type Activity = {
  id: string;
  kind: string;
  occurred_at: string;
  outcome: string | null;
  products_discussed: string | null;
  requirements: string | null;
  sample_request: string | null;
  price_enquiry: string | null;
  opportunity_value: number | null;
  objections: string | null;
  next_action: string | null;
  follow_up_date: string | null;
  notes: string | null;
  by: string | null;
  has_location: boolean;
};

export type CustomerProfile = {
  access: "staff" | "salesperson" | "customer";
  customer: Customer;
  salesperson: { id: string; name: string; phone: string | null; employee_code: string } | null;
  stats: { orders: number; total_value: number; first_order_at: string | null; last_order_at: string | null; avg_order_value: number | null; orders_per_month: number; open_orders: number };
  segments: string[];
  credit: Credit | null;
  favourites: { item_id: string; name: string; qty: number; times: number; last_at: string }[];
  orders: { id: string; order_no: string; created_at: string; total: number; source: string; status: string; stage: string; items: number; invoice_number: string | null; payment_method: string }[];
  activities: Activity[] | null;
  price_requests: { id: string; item: string; requested_price: number; current_price: number | null; status: string; approved_price: number | null; requested_at: string; decision_note: string | null }[] | null;
  consent_log: { at: string; consent: boolean; channels: string[]; source: string; note: string | null }[] | null;
  logins: { user_id: string; email: string | null; phone: string | null; name: string | null; status: string; request_note: string | null; created_at: string }[] | null;
  invites: { contact: string; invited_at: string; accepted_at: string | null }[] | null;
  item_access: { item_id: string; name: string; allowed: boolean }[] | null;
};

export type Me =
  | { state: "signed_out" | "not_registered" | "closed" }
  | { state: "pending_approval"; link_request?: boolean }
  | {
      state: "active" | "suspended";
      customer: Pick<Customer, "id" | "customer_code" | "shop_name" | "owner_name" | "mobile" | "whatsapp" | "email" | "business_address" | "delivery_address" | "locality" | "city" | "pincode" | "gstin" | "customer_type" | "payment_terms" | "credit_days" | "price_category" | "marketing_consent" | "consent_channels" | "preferred_channel">;
      salesperson: { name: string; phone: string | null } | null;
      credit: Credit;
      stats: { orders: number; total_value: number; last_order_at: string | null; open_orders: number };
      unread: number;
      support: { phone?: string; whatsapp?: string; email?: string } | null;
      payment_methods: string[];
    };

export type Statement = {
  from: string;
  to: string;
  opening: number;
  closing: number;
  lines: { date: string; entry_no: string; kind: string; memo: string; debit: number; credit: number; balance: number; order_id: string | null }[];
  open_invoices: { order_id: string; order_no: string | null; invoice_number: string; invoice_date: string; total: number; outstanding: number; due_date: string; overdue: boolean }[];
  payments: { payment_no: string; paid_on: string; amount: number; method: string; reference: string | null }[];
  credit: Credit;
};
