import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from "@/lib/order-rules";

export const membership = {
  name: "Mithai Wallah Membership",
  fee: 199,
  period: "year",
  discountPercent: 20,
  freeDeliveryThreshold: 499,
  exclusionNote: "Milk subscriptions excluded from discount benefits.",
};

export const membershipBenefits = [
  {
    icon: "⚡",
    title: "Fast Delivery",
    description: "Member orders are prepared and dispatched first, so your sweets reach you sooner.",
  },
  {
    icon: "🎧",
    title: "Priority Support",
    description: "A dedicated WhatsApp line for members, answered ahead of the regular queue.",
  },
  {
    icon: "🏷️",
    title: `${membership.discountPercent}% Off Sweets & Food`,
    description: `Save ${membership.discountPercent}% on every sweet and food order for the full year.`,
  },
  {
    icon: "🚚",
    title: `Free Delivery Above ₹${membership.freeDeliveryThreshold}`,
    description: `Free delivery in Prayagraj on orders above ₹${membership.freeDeliveryThreshold}, instead of ₹${FREE_DELIVERY_THRESHOLD}.`,
  },
  {
    icon: "🔔",
    title: "Early Access",
    description: "Be the first to order new sweets, festive boxes and limited seasonal batches.",
  },
  {
    icon: "🎁",
    title: "Exclusive Offers",
    description: "Member-only offers on festivals, birthdays and anniversaries.",
  },
];

export const membershipComparison = [
  { feature: "Discounts", regular: "Occasional offers", member: `${membership.discountPercent}% off sweets & food` },
  { feature: "Delivery Charges", regular: `Free above ₹${FREE_DELIVERY_THRESHOLD} (₹${DELIVERY_FEE} below)`, member: `Free above ₹${membership.freeDeliveryThreshold}` },
  { feature: "Priority Delivery", regular: "Standard", member: "Prepared and dispatched first" },
  { feature: "Special Offers", regular: "Public offers only", member: "Member-only festive & birthday offers" },
  { feature: "Early Access", regular: "—", member: "New sweets & festive boxes first" },
];
