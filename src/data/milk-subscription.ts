import type { FaqItem } from "@/data/faqs";
import { SUBSCRIBER_FREE_DELIVERY_MINIMUM } from "@/lib/order-rules";

export const milkSubscription = {
  name: "Farm Fresh Milk Subscription",
  headline: "Fresh Milk From Local Farmers, Delivered To Your Doorstep",
  subheadline:
    "Join our early interest list for fresh milk sourced directly from local farmers and delivered within hours of collection.",
  pricePerLitre: 100,
  launchThreshold: 50,
  launchNotice:
    "We will launch this service only after receiving confirmed interest from at least 50 regular subscription customers.",
  community: "A community of customers who value fresh milk, local farmers, transparency, and quality food.",
};

export const milkProductPoints = [
  { title: "From local farmers", description: "Fresh milk collected directly from farmers near Prayagraj." },
  { title: "No preservatives", description: "Nothing added to make it last longer on a shelf." },
  { title: "No unnecessary processing", description: "Kept as close as possible to how it leaves the farm." },
  { title: "No adulteration", description: "No water, no milk powder, no mixing. Just milk." },
  { title: "Reusable glass bottles", description: "Delivered in glass and collected back. No plastic pouches." },
  { title: "Farm-to-home transparency", description: "You know where your milk comes from and how it reached you." },
  { title: "Hygienic & kept cold", description: "Hygienic handling and cold-chain maintenance from farm to door." },
];

/** What an active milk subscriber gets automatically. There is no separate fee. */
export const milkSubscriberBenefits = [
  "Priority delivery",
  `Free delivery on Mithai Wallah products above ₹${SUBSCRIBER_FREE_DELIVERY_MINIMUM}`,
  "Early access to new products",
  "Exclusive subscriber-only offers",
  "Priority customer support",
  "Special festive discounts throughout the year",
  "Access to limited-edition sweet collections",
];

export const milkSteps = [
  { title: "Collected Fresh", description: "Milk is collected fresh from local farmers near Prayagraj." },
  { title: "Checked & Bottled", description: "Every lot is checked, then filled into clean, reusable glass bottles." },
  { title: "Kept Cold", description: "Handled hygienically and kept cold all the way to your door." },
  { title: "At Your Door", description: "Delivered within hours of collection. Hand back the empty bottles next time." },
];

/** Same questions as the Google Form, so WhatsApp, Form and database responses line up. */
export const milkInterestFields = [
  { name: "name", label: "Name", required: true },
  { name: "mobile", label: "Mobile Number", type: "tel" as const, required: true },
  { name: "address", label: "Address", type: "textarea" as const, required: true },
  { name: "area", label: "Locality", required: true },
  { name: "dailyLitres", label: "Daily Milk Requirement (litres)", type: "number" as const, required: true },
  { name: "timing", label: "Morning / Evening Preference", type: "select" as const, required: true, options: ["Morning", "Evening", "Both"] },
  { name: "familyMembers", label: "Number of Family Members", type: "number" as const },
  { name: "monthlyLitres", label: "Monthly Milk Requirement (litres)", type: "number" as const },
  {
    name: "preferredTime",
    label: "Preferred Delivery Time",
    type: "select" as const,
    options: ["5–7 AM", "7–9 AM", "9–11 AM", "4–6 PM", "6–8 PM"],
  },
  { name: "subscription", label: "Interested in Subscription?", type: "select" as const, required: true, options: ["Yes", "No"] },
  { name: "notes", label: "Additional Comments", type: "textarea" as const },
];

export const milkFaqs: FaqItem[] = [
  {
    question: "Can I subscribe today?",
    answer: `Not yet. ${milkSubscription.launchNotice} Registering your interest is free and takes no payment. We'll contact you before launch.`,
  },
  {
    question: "How much will it cost?",
    answer: `The proposed price is ₹${milkSubscription.pricePerLitre} per litre, delivered in reusable glass bottles.`,
  },
  {
    question: "What do milk subscribers get?",
    answer: `Subscribers automatically get ${milkSubscriberBenefits.map((benefit) => benefit.charAt(0).toLowerCase() + benefit.slice(1)).join(", ")}. There is no extra fee.`,
  },
  {
    question: "How fresh is the milk?",
    answer:
      "Milk is collected fresh from local farmers and delivered within hours of collection, handled hygienically and kept cold on the way.",
  },
  {
    question: "Which areas will you deliver to?",
    answer:
      "Delivery will start in Prayagraj. The areas we cover first depend on where registrations come from, so please fill in your locality.",
  },
  {
    question: "Can I change or withdraw my interest?",
    answer:
      "Yes. If you registered while signed in, you can see, update or withdraw your registration from your account page at any time.",
  },
];
