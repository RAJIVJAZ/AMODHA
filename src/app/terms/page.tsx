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
      updated="17 September 2026"
      sections={[
        {
          heading: "1. Acceptance of Terms",
          body: [
            `By accessing or using this website, you agree to be bound by these Terms & Conditions. ${siteConfig.name} operates the Mithaiwallah Sweet Corner sweets brand from the same manufacturing facility in Prayagraj, Uttar Pradesh.`,
          ],
        },
        {
          heading: "2. Products & Availability",
          body: [
            "All products are subject to availability. Product images and descriptions are for illustrative purposes; actual packaging, weight and appearance may vary slightly due to the handmade nature of our sweets.",
            "Prices for retail, wholesale and gifting orders are shared directly by our sales team and are subject to change without prior notice.",
          ],
        },
        {
          heading: "3. Orders & Enquiries",
          body: [
            "Enquiry forms on this website (including wholesale, corporate and wedding gifting forms) are not binding orders. An order is confirmed only after our team has communicated final pricing, quantity and delivery details with you directly.",
          ],
        },
        {
          heading: "4. Wholesale & Dealer Terms",
          body: [
            "Wholesale pricing, minimum order quantities and payment terms are governed by a separate agreement communicated to dealers and distributors during onboarding.",
          ],
        },
        {
          heading: "5. Intellectual Property",
          body: [
            "All content on this website — including text, logos, images and the Amodha and Mithaiwallah Sweet Corner brand names — is the property of Amodha Dairy Products and may not be used without written permission.",
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
