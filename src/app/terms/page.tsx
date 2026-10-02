import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms and Conditions for using the ${siteConfig.name} website and ordering our products.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="2 October 2026"
      sections={[
        {
          heading: "1. Acceptance of Terms",
          body: [
            `By accessing or using this website, you agree to be bound by these Terms & Conditions. This website and the ${siteConfig.name} brand are operated by ${siteConfig.legalName}, Prayagraj, Uttar Pradesh.`,
          ],
        },
        {
          heading: "2. Products & Availability",
          body: [
            "All products are subject to availability. Product images and descriptions are for illustrative purposes; actual packaging, weight and appearance may vary slightly due to the handmade nature of our sweets.",
            "Prices shown on the website apply to online orders. Prices for wholesale and custom gifting orders are shared directly by our team and are subject to change without prior notice.",
          ],
        },
        {
          heading: "3. Orders & Enquiries",
          body: [
            "Online orders are confirmed once payment succeeds or, for Cash on Delivery, once our team confirms the order with you. Enquiry forms on this website (including wholesale, corporate and wedding gifting forms) are not binding orders.",
          ],
        },
        {
          heading: "4. Wholesale & Dealer Terms",
          body: [
            "Wholesale pricing and payment terms are governed by a separate agreement communicated to dealers and distributors during onboarding.",
          ],
        },
        {
          heading: "5. Intellectual Property",
          body: [
            `All content on this website — including text, logos, images and the ${siteConfig.name} brand name — is the property of ${siteConfig.legalName} and may not be used without written permission.`,
          ],
        },
        {
          heading: "6. Limitation of Liability",
          body: [
            "While we take every care in the manufacturing and handling of our products, we are not liable for damages arising from misuse, improper storage after delivery, or delays caused by third-party logistics providers beyond our reasonable control.",
          ],
        },
        {
          heading: "7. Governing Law",
          body: [
            "These Terms are governed by the laws of India, and any disputes shall be subject to the jurisdiction of the courts in Prayagraj, Uttar Pradesh.",
          ],
        },
        {
          heading: "8. Contact Us",
          body: [`For any questions regarding these Terms, contact us at ${siteConfig.contact.email}.`],
        },
      ]}
    />
  );
}
