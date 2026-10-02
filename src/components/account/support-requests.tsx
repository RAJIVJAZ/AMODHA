"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type SupportRequest = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "resolved";
  reply: string | null;
  order_number: number | null;
  created_at: string;
};

const inputClass = "rounded-xl border-2 border-ink/30 px-3 py-2 text-sm focus:border-primary focus:outline-none";

export function SupportRequests({ requests, orderNumbers }: { requests: SupportRequest[]; orderNumbers: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", orderNumber: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: insertError } = await createClient().from("support_requests").insert({
      subject: form.subject.trim(),
      message: form.message.trim(),
      order_number: form.orderNumber ? Number(form.orderNumber) : null,
    });
    if (insertError) {
      setError("Couldn't send your request. Please try again or message us on WhatsApp.");
      return;
    }
    setOpen(false);
    setForm({ subject: "", message: "", orderNumber: "" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.length === 0 && !open ? <p className="text-sm text-dark/60">No support requests.</p> : null}
      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-xl border-2 border-ink/15 bg-blush px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">
                {request.subject}
                {request.order_number ? <span className="font-normal text-dark/60"> · Order #{request.order_number}</span> : null}
              </p>
              <span
                className={`rounded-full border-2 px-2 py-0.5 text-xs font-semibold ${
                  request.status === "open" ? "border-accent text-accent-dark" : "border-green-700 text-green-700"
                }`}
              >
                {request.status === "open" ? "Open" : "Resolved"}
              </span>
            </div>
            <p className="mt-1 text-dark/70">{request.message}</p>
            {request.reply ? (
              <p className="mt-2 rounded-lg bg-white px-3 py-2 text-dark/80">
                <span className="font-semibold text-ink">Our reply: </span>
                {request.reply}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border-2 border-ink/15 p-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            Subject
            <input required maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputClass} />
          </label>
          {orderNumbers.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
              Related order (optional)
              <select value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} className={inputClass}>
                <option value="">None</option>
                {orderNumbers.map((number) => (
                  <option key={number} value={number}>
                    Order #{number}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            How can we help?
            <textarea required rows={3} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputClass} />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="font-heading rounded-full border-2 border-ink bg-accent px-5 py-2 text-xs font-semibold uppercase text-white">
              Send request
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-dark/60 hover:underline">
              Cancel
            </button>
          </div>
          {error ? <p role="alert" className="text-sm text-accent-dark">{error}</p> : null}
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-semibold text-primary-dark hover:underline">
          + Raise a request
        </button>
      )}
    </div>
  );
}
