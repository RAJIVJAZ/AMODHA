import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `Refund and cancellation policy for orders placed with ${siteConfig.name} and Mithaiwallah Sweet Corner.`,
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="17 September 2026"
      sections={[
        {
          heading: "1. Perishable Goods",
          body: [
            "Our dairy products and sweets are fresh, perishable food items manufactured to order or in small daily batches. Because of this, we generally do not accept returns once a product has been delivered and accepted.",
          ],
        },
        {
          heading: "2. Quality Issues",
          body: [
            `If you receive a product that is damaged, spoiled, or significantly different from what was ordered, please contact us within 24 hours of delivery at ${siteConfig.contact.email} or ${siteConfig.contact.phone} with photos of the product and packaging. We will investigate and, where the issue is confirmed to be on our end, offer a replacement or refund.`,
          ],
        },
        {
          heading: "3. Order Cancellations",
          body: [
            "Retail orders may be cancelled before dispatch by contacting our team directly. Wholesale, corporate and wedding gifting orders with custom packaging or branding cannot be cancelled once production has started, given the customised nature of the work.",
          ],
        },
        {
          heading: "4. Refund Processing",
          body: [
            "Approved refunds are processed to the original payment method within 7-10 business days. For orders paid via cash or bank transfer, refunds are issued via bank transfer to the account used for payment.",
          ],
        },
        {
          heading: "5. Bulk & Custom Orders",
          body: [
            "Corporate and wedding gifting orders involving custom branding, printing or box design require advance approval of the final design. Once approved and production begins, these orders are non-refundable except in cases of manufacturing defect.",
          ],
        },
        {
          heading: "6. Contact Us",
          body: [`For refund or cancellation requests, reach out to us at ${siteConfig.contact.email}.`],
        },
      ]}
    />
  );
}
