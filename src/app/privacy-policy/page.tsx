import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${siteConfig.name} — how we collect, use and protect your information.`,
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="17 September 2026"
      sections={[
        {
          heading: "1. Introduction",
          body: [
            `This Privacy Policy explains how ${siteConfig.name} ("Amodha", "we", "us", "our") collects, uses and protects information you share with us through this website, WhatsApp, phone or email, whether you are a retail customer, wholesale partner, corporate client or job applicant.`,
          ],
        },
        {
          heading: "2. Information We Collect",
          body: [
            "We collect information you voluntarily provide when you submit an enquiry form, contact us via WhatsApp, email or phone, or place an order — including your name, phone number, email address, business name, delivery address and the details of your enquiry.",
            "We may also collect standard technical information automatically, such as browser type, device information and pages visited, to help us understand how visitors use our website.",
          ],
        },
        {
          heading: "3. How We Use Your Information",
          body: [
            "We use the information you provide to respond to enquiries, process orders, provide wholesale or corporate gifting quotes, and communicate with you about your order status.",
            "With your consent, we may also use your contact details to share offers, new product updates or seasonal gifting promotions. You can opt out of promotional messages at any time.",
          ],
        },
        {
          heading: "4. How We Share Your Information",
          body: [
            "We do not sell your personal information to third parties. We may share your information with logistics and delivery partners solely to fulfil your order, or where required by law.",
          ],
        },
        {
          heading: "5. Data Security",
          body: [
            "We take reasonable technical and organisational measures to protect the information you share with us against unauthorised access, loss or misuse.",
          ],
        },
        {
          heading: "6. Your Rights",
          body: [
            `You may request access to, correction of, or deletion of your personal information at any time by contacting us at ${siteConfig.contact.email}.`,
          ],
        },
        {
          heading: "7. Contact Us",
          body: [
            `If you have questions about this Privacy Policy, please contact us at ${siteConfig.contact.email} or ${siteConfig.contact.phone}.`,
          ],
        },
      ]}
    />
  );
}
