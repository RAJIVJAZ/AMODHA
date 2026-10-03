"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { orderStatusLabels, type OrderStatus } from "@/lib/order-status";

const options: OrderStatus[] = ["received", "preparing", "out_for_delivery", "delivered", "cancelled"];

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(next: string) {
    setSaving(true);
    setError(false);
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  if (status === "pending_payment") {
    return <span className="text-xs font-semibold text-dark/50">{orderStatusLabels.pending_payment}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label="Order status"
        value={status}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border-2 border-ink/30 px-2 py-1 text-sm focus:border-primary focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {orderStatusLabels[option]}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-accent-dark">Not saved</span> : null}
    </div>
  );
}
