"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSweet } from "@/data/sweets";
import { createClient } from "@/lib/supabase/client";

export function WishlistList({ slugs }: { slugs: string[] }) {
  const router = useRouter();
  const items = slugs.map((slug) => getSweet(slug)).filter((sweet) => sweet !== undefined);

  async function remove(slug: string) {
    await createClient().from("wishlist").delete().eq("slug", slug);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-dark/60">
        Nothing saved yet. Tap &ldquo;Save to wishlist&rdquo; on any{" "}
        <Link href="/#catalog" className="font-semibold text-primary-dark hover:underline">
          sweet
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((sweet) => (
        <li key={sweet.slug} className="flex items-center gap-3 rounded-xl border-2 border-ink/15 bg-blush p-2 pr-3">
          {sweet.image ? (
            <Image src={sweet.image} alt="" width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <Link href={`/sweet-corner/${sweet.slug}`} className="font-heading block truncate font-bold text-ink hover:underline">
              {sweet.name}
            </Link>
            <p className="text-xs text-dark/60">From ₹{Math.min(...sweet.packSizes.map((pack) => pack.price))}</p>
          </div>
          <button type="button" onClick={() => remove(sweet.slug)} className="text-xs font-semibold text-accent-dark hover:underline">
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
