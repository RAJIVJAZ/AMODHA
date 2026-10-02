"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProfileName({ userId, initialName }: { userId: string; initialName: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initialName);
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error: saveError } = await createClient().from("profiles").update({ full_name: name.trim() }).eq("id", userId);
    if (saveError) {
      setError("Couldn't save your name. Please try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Namaste, {initialName}</h1>
        <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-primary-dark hover:underline">
          Edit name
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full-name" className="text-sm font-semibold text-ink">
          Your name
        </label>
        <input
          id="full-name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border-2 border-ink/30 px-3 py-2 text-base focus:border-primary focus:outline-none"
        />
      </div>
      <button type="submit" className="font-heading rounded-full border-2 border-ink bg-accent px-5 py-2 text-xs font-semibold uppercase text-white">
        Save
      </button>
      {error ? <p role="alert" className="w-full text-sm text-accent-dark">{error}</p> : null}
    </form>
  );
}
