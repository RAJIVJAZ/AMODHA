import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { formatInr } from "@/lib/currency";
import {
  DELIVERY_AREA,
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  MAX_ONLINE_ORDER_GRAMS,
  formatGrams,
} from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: `Shipping and delivery policy for ${siteConfig.name} and Mithaiwallah Sweet Corner orders.`,
  alternates: { canonical: "/shipping-policy" },
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping Policy"
      updated="2 October 2026"
      sections={[
        {
          heading: "1. Dispatch Location",
          body: [
            `All orders are prepared and dispatched from our kitchen at ${siteConfig.address.plant.line2}, ${siteConfig.address.plant.city}, ${siteConfig.address.plant.state}.`,
          ],
        },
        {
          heading: "2. Delivery Area",
          body: [
            `Online orders are currently delivered within ${DELIVERY_AREA} only. Bulk corporate or wedding orders outside ${DELIVERY_AREA} are considered case by case — please contact us before ordering.`,
          ],
        },
        {
          heading: "3. Delivery Charges",
          body: [
            `Delivery is free on orders of ${formatInr(FREE_DELIVERY_THRESHOLD)} or more. Orders below ${formatInr(FREE_DELIVERY_THRESHOLD)} carry a flat ${formatInr(DELIVERY_FEE)} delivery fee. The fee is shown in your cart and at checkout before you pay.`,
          ],
        },
        {
          heading: "4. Order Limits",
          body: [
            `Online orders are limited to ${formatGrams(MAX_ONLINE_ORDER_GRAMS)} in total. For larger quantities, contact us on WhatsApp or through our contact page for bulk pricing and delivery.`,
          ],
        },
        {
          heading: "5. Delivery Timelines",
          body: [
            `Online orders within ${DELIVERY_AREA} are typically delivered same-day or next-day. Corporate and wedding gifting orders require 7-15 days of lead time depending on quantity and customisation.`,
          ],
        },
        {
          heading: "6. Packaging",
          body: [
            "Sweets are packed in sealed, food-safe boxes in our hygienic kitchen so they reach you fresh and untouched.",
          ],
        },
        {
          heading: "7. Contact Us",
          body: [`For questions about delivery status, contact us at ${siteConfig.contact.phone} or via WhatsApp.`],
        },
      ]}
    />
  );
}
