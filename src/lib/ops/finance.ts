import type { Ops } from "@/lib/ops/context";

export const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

/** Cash, bank and gateway accounts money can be paid from or into. */
export async function moneyAccounts(ops: Ops) {
  const { data } = await ops.supabase.from("bank_accounts").select("account_code, name, kind").eq("is_active", true).order("account_code");
  return ((data ?? []) as { account_code: string; name: string; kind: string }[]).map((a) => ({ value: a.account_code, label: `${a.name} (${a.account_code})`, kind: a.kind }));
}

/** First day of the current month and today, in India time, as YYYY-MM-DD. */
export function monthToDate(today: string) {
  return { from: `${today.slice(0, 8)}01`, to: today };
}
