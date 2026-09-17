import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
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
      updated="17 September 2026"
      sections={[
        {
          heading: "1. Dispatch Locations",
          body: [
            `All orders are dispatched from our manufacturing facility in ${siteConfig.address.line2}, ${siteConfig.address.city}, ${siteConfig.address.state}.`,
          ],
        },
        {
          heading: "2. Delivery Areas",
          body: [
            "Retail and wholesale delivery is available within Prayagraj and select nearby cities in Uttar Pradesh, subject to route availability. Corporate and wedding gifting orders are dispatched Pan-India, with delivery timelines shared at the time of order confirmation.",
          ],
        },
        {
          heading: "3. Delivery Timelines",
          body: [
            "Local retail orders are typically delivered same-day or next-day. Wholesale orders follow scheduled dispatch based on your agreed order cycle. Corporate and wedding gifting orders require 7-15 days of lead time depending on quantity and customisation involved.",
          ],
        },
        {
          heading: "4. Packaging for Transit",
          body: [
            "Perishable dairy items are packed with appropriate cold-chain measures for local delivery. Sweets intended for gifting or long-distance dispatch are packed in travel-friendly formats (such as Bikaneri Cake and Milk Cake, which store well) with tamper-evident sealing.",
          ],
        },
        {
          heading: "5. Delivery Partners",
          body: [
            "We use a combination of our own delivery fleet for local orders and trusted third-party logistics partners for Pan-India gifting dispatch. Delivery timelines for third-party logistics are estimates and may occasionally vary due to factors outside our control.",
          ],
        },
        {
          heading: "6. Shipping Charges",
          body: [
            "Shipping charges, where applicable, are communicated at the time of order confirmation based on delivery location, order weight and urgency.",
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
