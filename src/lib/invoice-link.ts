import crypto from "crypto";
import { siteConfig } from "@/lib/site";

function secret() {
  return process.env.INVOICE_LINK_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/** A token that lets the person we emailed open their invoice without signing in. */
export function invoiceToken(orderId: string) {
  return crypto.createHmac("sha256", secret()).update(`invoice:${orderId}`).digest("hex").slice(0, 32);
}

export function isValidInvoiceToken(orderId: string, token: string | null) {
  if (!token || !secret()) return false;
  const expected = Buffer.from(invoiceToken(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function invoiceUrl(orderId: string) {
  return `${siteConfig.url}/invoice/${orderId}?t=${invoiceToken(orderId)}`;
}
