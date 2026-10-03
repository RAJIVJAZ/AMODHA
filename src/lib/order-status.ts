export const trackingSteps = [
  { status: "received", label: "Received" },
  { status: "preparing", label: "Preparing" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
] as const;

export type OrderStatus = "pending_payment" | "received" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  received: "Received",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
