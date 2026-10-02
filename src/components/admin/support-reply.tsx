"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SupportReply({ id }: { id: string }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reply }),
    });
    if (!res.ok) {
      setError("Reply not saved");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input
        aria-label="Reply"
        required
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Reply and mark resolved"
        className="flex-1 rounded-lg border-2 border-ink/30 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
      />
      <button type="submit" className="font-heading rounded-full border-2 border-ink bg-accent px-4 py-1.5 text-xs font-semibold uppercase text-white">
        Send reply
      </button>
      {error ? <span className="text-xs text-accent-dark">{error}</span> : null}
    </form>
  );
}
