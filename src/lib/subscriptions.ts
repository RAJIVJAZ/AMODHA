import { createAdminClient } from "@/lib/supabase/admin";

export type MilkSubscriptionStatus = {
  /** Settings → "Milk subscriptions open to customers". */
  enabled: boolean;
  /** Lowest price of an active milk subscription pack, or null when there is none with a price. */
  fromPrice: number | null;
  /** Customers can start a subscription: switched on and there is milk to subscribe to. */
  open: boolean;
};

const closed: MilkSubscriptionStatus = { enabled: false, fromPrice: null, open: false };

export async function milkSubscriptionStatus(): Promise<MilkSubscriptionStatus> {
  const admin = createAdminClient();
  if (!admin) return closed;
  const [{ data: setting, error }, { data: packs }, { data: firstDay }] = await Promise.all([
    admin.from("business_settings").select("value").eq("key", "subscriptions.enabled").maybeSingle(),
    admin.from("items").select("id, products!inner(id)").eq("is_active", true).eq("products.is_subscribable", true).eq("products.is_active", true),
    admin.rpc("sub_first_open_date"),
  ]);
  if (error) return closed;
  const enabled = setting?.value === true;
  const prices = await Promise.all(
    ((packs ?? []) as { id: string }[]).map(async (pack) => {
      const { data } = await admin.rpc("item_price_on", { p_item_id: pack.id, p_date: firstDay });
      return data === null || data === undefined ? null : Number(data);
    })
  );
  const priced = prices.filter((price): price is number => price !== null);
  const fromPrice = priced.length ? Math.min(...priced) : null;
  return { enabled, fromPrice, open: enabled && fromPrice !== null };
}

/** Whether customers can start a milk subscription in the app right now. */
export async function subscriptionsOpen() {
  return (await milkSubscriptionStatus()).open;
}
