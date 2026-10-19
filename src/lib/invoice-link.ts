import crypto from "crypto";
import { siteConfig } from "@/lib/site";

// Invoice links in emails open the invoice without signing in for a year. After that (or for a link that
// has been tampered with) the customer signs in to see it. Links sent before expiry dates were added
// (no `e` parameter) keep working until LEGACY_LINKS_UNTIL.
const VALID_DAYS = 365;
const LEGACY_LINKS_UNTIL = Date.UTC(2027, 3, 19);

function secret() {
  return process.env.INVOICE_LINK_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

function sameToken(expected: string, given: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Days since 1 January 1970 (UTC). */
function dayNumber(ms = Date.now()) {
  return Math.floor(ms / 86_400_000);
}

export function isValidInvoiceToken(orderId: string, token: string | null, expires: string | null) {
  if (!token || !secret()) return false;
  if (expires === null) {
    return Date.now() < LEGACY_LINKS_UNTIL && sameToken(sign(`invoice:${orderId}`), token);
  }
  if (!/^\d{1,6}$/.test(expires) || Number(expires) < dayNumber()) return false;
  return sameToken(sign(`invoice:${orderId}:${expires}`), token);
}

export function invoiceUrl(orderId: string) {
  const expires = dayNumber() + VALID_DAYS;
  return `${siteConfig.url}/invoice/${orderId}?t=${sign(`invoice:${orderId}:${expires}`)}&e=${expires}`;
}
