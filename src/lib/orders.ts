import type { SupabaseClient } from "@supabase/supabase-js";
import { getPack, getSweet } from "@/data/sweets";
import { productTax } from "@/data/tax";
import { bestDiscountFor, deliveryFeeFor, type DiscountReason } from "@/lib/order-rules";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type OrderLineInput = { slug: string; packLabel: string; quantity: number };

export type CustomerDetails = {
  name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  pincode: string;
  notes: string | null;
};

export type PricedLine = {
  slug: string;
  productName: string;
  packLabel: string;
  unitPrice: number;
  quantity: number;
};

export function isOrderLine(value: unknown): value is OrderLineInput {
  const line = value as OrderLineInput;
  return (
    typeof line?.slug === "string" &&
    typeof line?.packLabel === "string" &&
    Number.isInteger(line?.quantity) &&
    line.quantity > 0
  );
}

/** Prices a cart from the catalog on the server; the browser's prices are never trusted. */
export function priceLines(items: unknown): { lines: PricedLine[]; subtotal: number } | { error: string } {
  if (!Array.isArray(items) || items.length === 0 || !items.every(isOrderLine)) {
    return { error: "Your cart is empty or invalid" };
  }

  const lines: PricedLine[] = [];
  for (const item of items) {
    const sweet = getSweet(item.slug);
    const pack = getPack(item.slug, item.packLabel);
    if (!sweet || !pack) return { error: `${item.slug} (${item.packLabel}) is not available online` };
    lines.push({ slug: item.slug, productName: sweet.name, packLabel: pack.label, unitPrice: pack.price, quantity: item.quantity });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return { lines, subtotal };
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function parseCustomer(value: unknown): CustomerDetails | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  const name = text(input.name, 120);
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  const address = text(input.address, 500);
  const city = text(input.city, 80);
  const pincode = text(input.pincode, 10);
  if (!name || !address || !city || !pincode) return { error: "Please fill in your name and full delivery address" };
  if (!phone) return { error: "Please enter a valid 10-digit mobile number" };
  const email = text(input.email, 200)?.toLowerCase() ?? null;
  return { name, phone, email, address, city, pincode, notes: text(input.notes, 500) };
}

/** A signed-in customer. Phone and email are set only when Supabase has verified them. */
export type SignedInCustomer = { id: string; phone: string | null; email: string | null };

const SAFE_EMAIL = /^[^\s",()]+@[^\s",()]+$/;

function verifiedEmail(email: string | undefined, confirmedAt: string | undefined) {
  const lower = email?.toLowerCase();
  return lower && confirmedAt && SAFE_EMAIL.test(lower) ? lower : null;
}

export async function getSignedInCustomer(): Promise<SignedInCustomer | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone_confirmed_at ? normalizePhone(user.phone ?? "") : null,
    email: verifiedEmail(user.email, user.email_confirmed_at),
  };
}

/**
 * PostgREST filter matching rows that belong to this customer: their account, plus
 * orders placed before signing in with the same verified phone or email.
 */
export function customerFilter(customer: SignedInCustomer, options: { email?: boolean; extraPhone?: string | null } = {}) {
  const parts = [`user_id.eq.${customer.id}`];
  if (customer.phone) parts.push(`phone.eq.${customer.phone}`);
  if (options.extraPhone && options.extraPhone !== customer.phone) parts.push(`phone.eq.${options.extraPhone}`);
  if (options.email !== false && customer.email) parts.push(`email.eq."${customer.email}"`);
  return parts.join(",");
}

/**
 * True when this customer has no earlier confirmed order (online or COD) on their account,
 * verified phone or email — or on the phone number they are ordering for now.
 */
export async function isFirstOrder(admin: SupabaseClient, customer: SignedInCustomer, checkoutPhone?: string | null) {
  const match = customerFilter(customer, { extraPhone: checkoutPhone });
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .or(match)
    .not("status", "in", "(pending_payment,cancelled)");
  if (error) {
    console.error("First-order check failed:", error);
    return false;
  }
  return count === 0;
}

/** True when this customer has a milk subscription marked active by the team. */
export async function isActiveMilkSubscriber(admin: SupabaseClient, customer: SignedInCustomer) {
  // An active milk subscription in the app, or a registration the team has marked active.
  const [{ data: subscribed }, { count, error }] = await Promise.all([
    admin.rpc("is_active_milk_subscriber", { p_user_id: customer.id }),
    admin.from("milk_interest").select("id", { count: "exact", head: true }).or(customerFilter(customer)).eq("status", "active"),
  ]);
  if (subscribed === true) return true;
  if (error) {
    console.error("Milk subscriber check failed:", error);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function quoteOrder(admin: SupabaseClient | null, subtotal: number, checkoutPhone: string) {
  const customer = await getSignedInCustomer();
  const [eligible, milkSubscriber] =
    admin && customer
      ? await Promise.all([isFirstOrder(admin, customer, checkoutPhone), isActiveMilkSubscriber(admin, customer)])
      : [false, false];
  const { discount, reason } = bestDiscountFor(subtotal, { firstOrderEligible: eligible, milkSubscriber });
  const deliveryFee = deliveryFeeFor(subtotal, milkSubscriber);
  return { customer, discount, discountReason: reason, deliveryFee, milkSubscriber, total: subtotal + deliveryFee - discount };
}

/** What the checkout shows on its confirmation screen. All amounts come from the server. */
export function orderSummary(
  orderNumber: number | null,
  customer: CustomerDetails,
  priced: { lines: PricedLine[]; subtotal: number },
  quote: { deliveryFee: number; discount: number; discountReason: DiscountReason | null; total: number },
  paymentMethod: "online" | "cod"
) {
  return {
    orderNumber,
    paymentMethod,
    lines: priced.lines,
    subtotal: priced.subtotal,
    deliveryFee: quote.deliveryFee,
    discount: quote.discount,
    discountReason: quote.discountReason,
    total: quote.total,
    emailedTo: customer.email,
    deliverTo: { name: customer.name, phone: customer.phone, address: customer.address, city: customer.city, pincode: customer.pincode },
  };
}

export type OrderSummary = ReturnType<typeof orderSummary>;

type SaveOrderInput = {
  customer: CustomerDetails;
  userId: string | null;
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  discountReason: DiscountReason | null;
  total: number;
  paymentMethod: "online" | "cod";
  milkSubscriber: boolean;
  razorpayOrderId?: string;
};

/** Saves an order and its items. Returns its id and number, or null if saving failed. */
export async function saveOrder(admin: SupabaseClient, input: SaveOrderInput) {
  const isCod = input.paymentMethod === "cod";
  const { data: order, error } = await admin
    .from("orders")
    .insert({
      user_id: input.userId,
      customer_name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
      address: input.customer.address,
      city: input.customer.city,
      pincode: input.customer.pincode,
      notes: input.customer.notes,
      payment_method: input.paymentMethod,
      payment_status: isCod ? "cod" : "pending",
      status: isCod ? "received" : "pending_payment",
      subtotal: input.subtotal,
      delivery_fee: input.deliveryFee,
      discount: input.discount,
      total: input.total,
      first_order_offer: input.discountReason === "first_order",
      discount_reason: input.discountReason,
      milk_subscriber: input.milkSubscriber,
      razorpay_order_id: input.razorpayOrderId ?? null,
    })
    .select("id, order_number")
    .single();

  if (error || !order) {
    console.error("Saving order failed:", error);
    return null;
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    input.lines.map((line) => ({
      order_id: order.id,
      slug: line.slug,
      product_name: line.productName,
      pack_label: line.packLabel,
      unit_price: line.unitPrice,
      quantity: line.quantity,
      hsn: productTax(line.slug).hsn,
      gst_rate: productTax(line.slug).gstRate,
    }))
  );
  if (itemsError) console.error("Saving order items failed:", itemsError);

  return { id: order.id as string, orderNumber: order.order_number as number };
}

/** Marks an online order as paid. Only moves orders still awaiting payment, so it is safe to call twice. */
export async function markOrderPaid(admin: SupabaseClient, razorpayOrderId: string, razorpayPaymentId: string) {
  const { error } = await admin
    .from("orders")
    .update({ payment_status: "paid", status: "received", razorpay_payment_id: razorpayPaymentId })
    .eq("razorpay_order_id", razorpayOrderId)
    .eq("status", "pending_payment");
  if (error) console.error("Marking order paid failed:", error);

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, payment_status")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (!order) return null;
  return { id: order.id as string, orderNumber: order.order_number as number, paid: order.payment_status === "paid" };
}
