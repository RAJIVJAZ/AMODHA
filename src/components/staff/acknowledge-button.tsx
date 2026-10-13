"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { staffAcknowledge } from "@/lib/staff/actions";

export function AcknowledgeButton({ version }: { version: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await staffAcknowledge(version);
          setBusy(false);
          if (!res.ok) return setError(res.message);
          router.refresh();
        }}
        className="w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Saving…" : "I have read this notice"}
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-accent-dark">{error}</p> : null}
    </div>
  );
}
