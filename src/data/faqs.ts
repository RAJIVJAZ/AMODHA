import { formatInr } from "@/lib/currency";
import {
  DELIVERY_AREA,
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  MAX_ONLINE_ORDER_GRAMS,
  formatGrams,
} from "@/lib/order-rules";
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
    question: "Is there a limit on how much I can order online?",
    answer: `Online orders are limited to ${formatGrams(MAX_ONLINE_ORDER_GRAMS)} in total, so every order reaches you fresh. For anything above ${formatGrams(MAX_ONLINE_ORDER_GRAMS)}, message us on WhatsApp or use our contact page and we'll share bulk pricing.`,
  },
  {
    question: "How can I pay?",
    answer:
      "Pay online at checkout with UPI, debit/credit cards or netbanking — payments are processed securely by Razorpay. You can also choose Cash on Delivery or UPI on delivery.",
  },
  {
    question: "What does \"every batch recorded live\" mean?",
    answer:
      "Each batch of sweets is cooked on camera in our hygienic kitchen, from fresh milk to finished mithai. It's our way of showing you exactly what goes into your sweets, with nothing hidden.",
  },
  {
    question: "Where is your kitchen located?",
    answer: `Our kitchen is at ${siteConfig.address.plant.line1}, ${siteConfig.address.plant.line2}, ${siteConfig.address.plant.city}, ${siteConfig.address.plant.state} ${siteConfig.address.plant.postalCode}. We started here in ${siteConfig.founded}.`,
  },
  {
    question: "Is Amodha FSSAI certified?",
    answer:
      "Yes, our manufacturing facility is FSSAI certified and follows documented hygiene and quality-control processes across milk collection, production and packaging.",
  },
  {
    question: "Do you supply wholesale to sweet shops, hotels and distributors?",
    answer:
      "Yes. Visit our Wholesale page to submit an enquiry, and our team will get in touch with pricing and minimum order quantities.",
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
  {
    question: "What is the minimum order quantity for wholesale or corporate orders?",
    answer:
      "Minimum order quantities vary by product and customisation level. Standard wholesale orders typically start at a few kilograms, while custom-branded corporate boxes usually start around 50-100 units. Contact our team for exact figures.",
  },
];

export const dealerFaqs: FaqItem[] = [
  {
    question: "How do I become a distributor or dealer for Amodha products?",
    answer: `Submit your details through the Wholesale page or write to us at ${siteConfig.contact.dealerEmail} with your business location and current trade activity. Our team will reach out to discuss territory and terms.`,
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
