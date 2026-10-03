"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function WishlistButton({ slug }: { slug: string }) {
  const [state, setState] = useState<"loading" | "signed-out" | "saved" | "not-saved">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setState("signed-out");
        return;
      }
      const { data: row } = await supabase.from("wishlist").select("slug").eq("slug", slug).maybeSingle();
      if (!cancelled) setState(row ? "saved" : "not-saved");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function toggle() {
    const supabase = createClient();
    if (state === "saved") {
      setState("not-saved");
      const { error } = await supabase.from("wishlist").delete().eq("slug", slug);
      if (error) setState("saved");
    } else {
      setState("saved");
      const { error } = await supabase.from("wishlist").insert({ slug });
      if (error) setState("not-saved");
    }
  }

  const className =
    "font-heading inline-flex self-start items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-blush";

  if (state === "loading") return null;

  if (state === "signed-out") {
    return (
      <Link href={`/login?next=/sweet-corner/${slug}`} className={className}>
        <span aria-hidden="true">♡</span> Sign in to save
      </Link>
    );
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={state === "saved"} className={className}>
      <span aria-hidden="true" className="text-accent">
        {state === "saved" ? "♥" : "♡"}
      </span>
      {state === "saved" ? "Saved to wishlist" : "Save to wishlist"}
    </button>
  );
}
