import type { FaqItem } from "@/data/faqs";

export const milkSubscription = {
  name: "Farm Fresh Dairy Subscription",
  pricePerLitre: 100,
  deliveryWindow: "about 2 hours",
  launchThreshold: 50,
  launchNotice: "This service will launch only after we reach 50 subscription customers.",
};

export const milkPurityPoints = [
  "No chemicals",
  "No preservatives",
  "No recombined milk",
  "No milk powder",
  "No adulteration",
];

export const milkSteps = [
  { title: "Collected Fresh", description: "Milk is collected fresh from local farmers near Prayagraj." },
  { title: "Checked & Bottled", description: "Every lot is checked, then filled into clean, reusable glass bottles." },
  { title: "At Your Door", description: `Delivered to your doorstep ${milkSubscription.deliveryWindow} after collection.` },
  { title: "Bottles Back", description: "Hand back the empty bottles at your next delivery — no plastic pouches." },
];

/** Same questions as the Google Form, so WhatsApp and Form responses line up. */
export const milkInterestFields = [
  { name: "name", label: "Name", required: true },
  { name: "mobile", label: "Mobile Number", type: "tel" as const, required: true },
  { name: "address", label: "Address", type: "textarea" as const, required: true },
  { name: "area", label: "Area / Locality", required: true },
  { name: "dailyLitres", label: "Daily Requirement (Litres)", type: "number" as const, required: true },
  { name: "timing", label: "Morning / Evening Preference", type: "select" as const, required: true, options: ["Morning", "Evening", "Both"] },
  { name: "familyMembers", label: "Number of Family Members", type: "number" as const },
  { name: "subscription", label: "Interested in Subscription?", type: "select" as const, required: true, options: ["Yes", "No"] },
  { name: "a2", label: "Interested in A2 Milk?", type: "select" as const, options: ["Yes", "No"] },
  { name: "quantity", label: "Preferred Quantity", type: "select" as const, options: ["500 ml", "1 litre", "1.5 litres", "2 litres", "More than 2 litres"] },
  { name: "notes", label: "Additional Notes", type: "textarea" as const },
];

export const milkFaqs: FaqItem[] = [
  {
    question: "Can I buy milk subscription today?",
    answer: `Not yet. ${milkSubscription.launchNotice} Registering your interest is free and takes no payment — we'll contact you before launch.`,
  },
  {
    question: "How much will it cost?",
    answer: `₹${milkSubscription.pricePerLitre} per litre, delivered in reusable glass bottles.`,
  },
  {
    question: "How fresh is the milk?",
    answer: `Milk is collected fresh from local farmers and delivered to your doorstep ${milkSubscription.deliveryWindow} after collection.`,
  },
  {
    question: "What is not in the milk?",
    answer: "No chemicals, no preservatives, no recombined milk, no milk powder and no adulteration — just fresh milk.",
  },
  {
    question: "Which areas will you deliver to?",
    answer:
      "Delivery will start in Prayagraj. The areas we cover first will depend on where registrations come from, so please fill in your area or locality.",
  },
  {
    question: "Will you offer A2 milk?",
    answer: "We're measuring interest in A2 milk now. Tick \"Yes\" on the form if you'd like it.",
  },
];
