"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResendInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/admin/orders/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Not sent");
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="w-fit rounded-full border-2 border-ink bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-primary-light/40 disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send invoice email"}
      </button>
      {error ? <span className="text-xs text-accent-dark">{error}</span> : null}
    </span>
  );
}
