import { formatInr } from "@/lib/currency";
import { DELIVERY_AREA, DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";

export type FaqItem = { question: string; answer: string };

export const generalFaqs: FaqItem[] = [
  {
    question: "What are your sweets made with?",
    answer:
      "Every sweet is cooked in 100% pure desi ghee — no vanaspati or blended fats — using fresh milk we collect directly from around 100 local farmers near Prayagraj.",
  },
  {
    question: "Where do you deliver?",
    answer: `We currently deliver within ${DELIVERY_AREA} only. For bulk corporate or wedding orders outside ${DELIVERY_AREA}, contact us and we'll let you know what's possible.`,
  },
  {
    question: "How much does delivery cost?",
    answer: `Delivery is free on orders of ${formatInr(FREE_DELIVERY_THRESHOLD)} or more. Orders below ${formatInr(FREE_DELIVERY_THRESHOLD)} have a flat ${formatInr(DELIVERY_FEE)} delivery fee, shown in your cart before you pay.`,
  },
  {
    question: "Is there a minimum or maximum order?",
    answer:
      "No. Order as little or as much as you like online. For large function or event orders, message us on WhatsApp a day or two ahead so we can plan the batch.",
  },
  {
    question: "How can I pay?",
    answer:
      "Pay online at checkout with UPI, debit/credit cards or netbanking — payments are processed securely by Razorpay. You can also choose Cash on Delivery or UPI on delivery.",
  },
  {
    question: "What does \"recorded and traceable batches\" mean?",
    answer:
      "Every production batch is recorded — when it was made and what went into it — so any box of sweets can be traced back to its batch. Sweets are made and packed in a hygienic environment.",
  },
  {
    question: "When will fresh milk delivery start?",
    answer:
      "Our farm-fresh milk subscription (₹100 per litre, in reusable glass bottles) launches once 50 households in Prayagraj sign up. Register your interest on the Fresh Milk page and we'll contact you before launch.",
  },
  {
    question: "What is the Mithai Wallah Membership?",
    answer:
      "A ₹199-per-year membership with 20% off sweets and food products, free delivery on orders above ₹499, priority delivery and support, and early access to new products. Milk subscriptions are excluded from the discount. Membership is launching soon — join the waitlist on the Membership page.",
  },
  {
    question: "Where is your kitchen located?",
    answer: `Our kitchen is at ${siteConfig.address.plant.line1}, ${siteConfig.address.plant.line2}, ${siteConfig.address.plant.city}, ${siteConfig.address.plant.state} ${siteConfig.address.plant.postalCode}. We started here in ${siteConfig.founded}.`,
  },
  {
    question: "Is Mithai Wallah FSSAI certified?",
    answer:
      "Yes, our manufacturing facility is FSSAI certified and follows documented hygiene and quality-control processes across milk collection, production and packaging.",
  },
  {
    question: "Do you supply wholesale to sweet shops, hotels and distributors?",
    answer:
      "Yes. Visit our Wholesale page to submit an enquiry, and our team will get in touch with wholesale pricing.",
  },
  {
    question: "Can I get a custom-branded gift box for my company or wedding?",
    answer:
      "Yes. Our Corporate Gifting and Wedding Gifting teams offer custom boxes with logo printing, name printing, gold foiling and other premium packaging options. Visit those pages to request a quote.",
  },
  {
    question: "What is the shelf life of your sweets?",
    answer:
      "Shelf life varies by product — fresh milk-based sweets like kalakand typically last 4-5 days refrigerated, while khoya-based sweets like milk cake and Bikaneri cake last longer. We share exact shelf-life details with every bulk order.",
  },
];

export const dealerFaqs: FaqItem[] = [
  {
    question: "How do I become a distributor or dealer for Mithai Wallah?",
    answer: `Submit your details through the Wholesale page or write to us at ${siteConfig.contact.email} with your business location and current trade activity. Our team will reach out to discuss territory and terms.`,
  },
  {
    question: "Do you offer exclusive territory rights to distributors?",
    answer:
      "We evaluate territory exclusivity on a case-by-case basis depending on order volume commitments and market coverage. This is discussed directly during onboarding.",
  },
  {
    question: "What support do dealers get?",
    answer:
      "Dealers receive wholesale pricing, promotional schemes, marketing material and dedicated order support from our sales team.",
  },
];
