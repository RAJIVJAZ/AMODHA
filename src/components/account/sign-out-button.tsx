"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className="text-sm font-semibold text-primary-dark hover:underline">
      Sign out
    </button>
  );
}
