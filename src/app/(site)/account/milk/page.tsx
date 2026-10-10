import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MilkApp, type Catalogue, type Overview, type Statement } from "@/components/account/milk/milk-app";
import { todayIST } from "@/lib/ops/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Milk",
  robots: { index: false, follow: false },
};

export default async function MyMilkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/milk");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = one(sp.tab) ?? "deliveries";
  const monthParam = one(sp.month);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : null;
  const today = todayIST();

  const [{ data: overview, error }, { data: catalogue }, { data: profile }, { data: staffEdit }, statementRes] = await Promise.all([
    supabase.rpc("sub_my_overview"),
    supabase.rpc("sub_catalogue"),
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_permission", { p_module: "subscriptions", p_action: "edit" }),
    tab === "bills" ? supabase.rpc("sub_my_statement", { p_month: month ?? today }) : Promise.resolve({ data: null, error: null }),
  ]);

  return (
    <MilkApp
      overview={error ? null : (overview as Overview | null)}
      catalogue={catalogue as Catalogue | null}
      statement={statementRes.data as Statement | null}
      statementFailed={Boolean(statementRes.error)}
      profile={profile}
      staffPreview={staffEdit === true}
      tab={tab}
      day={one(sp.day)}
      today={today}
    />
  );
}
