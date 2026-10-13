// Wording shared by the Sales app, the Wholesale app and the B2B screens in the business app.

export const customerTypes: Record<string, string> = {
  sweet_shop: "Sweet shop",
  mithai_retailer: "Mithai retailer",
  sweet_manufacturer: "Sweet manufacturer",
  distributor: "Wholesale distributor",
  retail_food: "Retail food business",
  other: "Other commercial buyer",
};

export const customerStatuses: Record<string, string> = {
  lead: "Lead · pending approval",
  approved: "Approved B2B customer",
  rejected: "Rejected",
  suspended: "Suspended",
  inactive: "Inactive",
};

export const paymentTerms: Record<string, string> = {
  credit: "Approved credit",
  cod: "Pay on delivery",
  advance: "Advance payment",
};

export const paymentMethods: Record<string, string> = {
  credit: "On credit (approved terms)",
  cod: "Pay on delivery / dispatch",
  advance: "Advance (bank transfer / UPI before dispatch)",
  online: "Paid online",
};

/** The originating channel recorded on every order. */
export const channels: Record<string, { code: string; label: string }> = {
  sales_rep: { code: "SALES_REP", label: "Salesperson" },
  b2b_app: { code: "B2B_CUSTOMER_APP", label: "Wholesale app" },
  website: { code: "STOREFRONT", label: "Website" },
  app: { code: "STOREFRONT", label: "Shop app" },
  staff: { code: "ADMIN_ENTRY", label: "Staff entry" },
  subscription: { code: "SUBSCRIPTION", label: "Milk subscription" },
};

export const segments: Record<string, string> = {
  new_lead: "New leads",
  newly_acquired: "Newly acquired shops",
  active: "Active wholesale customers",
  high_volume: "High-volume customers",
  frequent: "Frequent buyers",
  not_ordered_recently: "Not ordered recently",
  inactive: "Inactive customers",
  needs_follow_up: "Needs follow-up",
  outstanding_payment: "Outstanding payments",
  festive_buyer: "Festive-season buyers",
  callback_requested: "Callback requested",
  marketing_consent: "Agreed to marketing",
};

export const approvalReasons: Record<string, string> = {
  stock_shortage: "Not enough stock — back-order / production",
  credit_limit: "Over the credit limit — finance approval",
  overdue_invoices: "Overdue invoices — finance approval",
  advance_payment: "Advance payment to be received",
};

export const activityKinds: Record<string, string> = {
  visit: "Visit",
  call: "Phone call",
  whatsapp: "WhatsApp",
  note: "Note",
  complaint: "Complaint",
  sample: "Sample given",
  callback_request: "Callback requested",
};

export const outcomes: Record<string, string> = {
  order_placed: "Order placed",
  interested: "Interested",
  follow_up: "Follow up later",
  price_enquiry: "Price enquiry",
  sample_given: "Sample given",
  not_interested: "Not interested",
  complaint: "Complaint",
  no_contact: "Shop closed / no contact",
  other: "Other",
};

export const availabilityLabels: Record<string, { label: string; tone: string }> = {
  in_stock: { label: "In stock", tone: "bg-emerald-100 text-emerald-800" },
  limited: { label: "Limited stock", tone: "bg-amber-100 text-amber-800" },
  made_to_order: { label: "Made to order", tone: "bg-sky-100 text-sky-800" },
};

/** Tone for a customer-facing order status label. */
export function statusTone(label: string) {
  if (/cancel|returned|declined/i.test(label)) return "bg-red-100 text-red-800";
  if (/delivered/i.test(label) && !/partial/i.test(label)) return "bg-emerald-100 text-emerald-800";
  if (/dispatch|out for delivery|ready/i.test(label)) return "bg-emerald-50 text-emerald-800";
  if (/pending stock|awaiting|on hold|rescheduled|partial/i.test(label)) return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

const sweetPhotos = new Set(["bikaneri-cake", "chocolate-barfi", "doda-barfi", "kalakand", "kunda", "malai-barfi", "milk-cake", "peda"]);

/** A product photo: the catalogue image, or the website's photo for the sweet. */
export function productImage(item: { image_url?: string | null; storefront_slug?: string | null }) {
  if (item.image_url) return item.image_url;
  if (item.storefront_slug && sweetPhotos.has(item.storefront_slug)) return `/images/sweet-corner/${item.storefront_slug}.webp`;
  return null;
}
