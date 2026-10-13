import type { Metadata } from "next";
import Link from "next/link";
import { OrderBuilder } from "@/components/b2b/order-builder";
import { ErrorBox, Notice, PageTitle } from "@/components/b2b/trade-ui";
import type { CatalogueItem } from "@/lib/b2b/types";
import { param, todayIST } from "@/lib/ops/format";
import { requireCustomer, rpc, UUID } from "../_lib/data";

export const metadata: Metadata = { title: "Quick order" };

type Line = { item_id: string; qty: number };
type Draft = { lines: Line[] | null; notes: string | null; updated_at: string } | null;
type Reorder = { customer_id: string; lines: (Line & { name: string })[] };

export default async function QuickOrder({ searchParams }: { searchParams: Promise<{ reorder?: string | string[]; add?: string | string[] }> }) {
  const me = await requireCustomer();
  if (me.state === "suspended") {
    return (
      <div>
        <PageTitle title="Quick order" />
        <Notice tone="warn">
          <p className="font-semibold">Ordering is paused on your account.</p>
          <p className="mt-1">Please contact your salesperson or our accounts team. You can still view your orders and statement.</p>
          <Link href="/trade/account" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">
            Go to account
          </Link>
        </Notice>
      </div>
    );
  }

  const sp = await searchParams;
  const reorderId = param(sp.reorder);
  const addId = param(sp.add);
  const customerId = me.customer.id;

  const [catalogue, draft] = await Promise.all([rpc<CatalogueItem[]>("b2b_catalogue"), rpc<Draft>("b2b_get_draft", { p_customer_id: customerId })]);
  if (catalogue.error) return <ErrorBox message={catalogue.error} />;
  const items = catalogue.data ?? [];
  const draftLines: Line[] = (draft.data?.lines ?? []).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) }));

  let initialLines: Line[] = draftLines;
  let notice: React.ReactNode = null;
  if (reorderId && UUID.test(reorderId)) {
    const re = await rpc<Reorder>("b2b_reorder_lines", { p_order_id: reorderId });
    if (re.data) {
      initialLines = re.data.lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) }));
      const missing = re.data.lines.filter((l) => !items.some((c) => c.item_id === l.item_id));
      notice = (
        <Notice tone="info">
          <p className="font-semibold">Reordering — prices and stock refreshed. Check before submitting.</p>
          <p className="mt-0.5">Quantities are copied from your earlier order; today&apos;s prices and offers apply.</p>
          {missing.length ? <p className="mt-1">No longer available to order: {missing.map((m) => m.name).join(", ")}.</p> : null}
        </Notice>
      );
    } else {
      notice = <Notice tone="bad">Could not load that order to reorder: {re.error}</Notice>;
    }
  } else if (addId && UUID.test(addId)) {
    const item = items.find((c) => c.item_id === addId);
    if (item && !draftLines.some((l) => l.item_id === addId)) {
      initialLines = [...draftLines, { item_id: addId, qty: Math.max(item.min_qty, item.multiple, 1) }];
    }
    if (item) notice = <Notice tone="good">Added {item.name}. Set the quantity below, then review your order.</Notice>;
  } else if (draft.data?.lines?.length) {
    notice = <Notice tone="info">Your saved draft has been loaded.</Notice>;
  }

  return (
    <div>
      <PageTitle
        title="Quick order"
        subtitle={
          <>
            Enter quantities, review the final prices and submit. Need ideas? <Link href="/trade/catalogue" className="font-semibold text-primary-dark underline">Browse the catalogue</Link>.
          </>
        }
      />
      {items.length === 0 ? (
        <Notice tone="warn">No items are available to order right now. Please contact your salesperson.</Notice>
      ) : (
        <OrderBuilder
          key={`${reorderId ?? ""}:${addId ?? ""}`}
          customerId={customerId}
          customerLabel={me.customer.shop_name}
          catalogue={items}
          initialLines={initialLines}
          initialNotes={draft.data?.notes ?? ""}
          paymentOptions={me.payment_methods}
          defaultPayment={me.customer.payment_terms}
          earliestDate={todayIST(1)}
          ordersBase="/trade/orders"
          notice={notice}
        />
      )}
    </div>
  );
}
