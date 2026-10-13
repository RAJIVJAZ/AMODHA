import Link from "next/link";
import { CustomerForm } from "@/components/b2b/customer-form";
import { PageHeader } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";

export const metadata = { title: "Add B2B customer" };

export default async function NewB2BCustomerPage() {
  const ops = await requireOps("b2b_customers", "create");
  const [{ data: required }, { data: spData }] = await Promise.all([
    ops.supabase.rpc("b2b_required_fields"),
    ops.supabase.from("salespeople").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const salespeople = ((spData ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, name: s.full_name }));
  return (
    <>
      <Link href="/ops/b2b/customers" className="text-sm font-semibold text-primary-dark">
        ← B2B customers
      </Link>
      <PageHeader
        title="Add B2B customer"
        description="Saved as a lead waiting for approval. We check the mobile number and GSTIN against existing customers as you type."
      />
      <div className="max-w-3xl">
        <CustomerForm mode="staff" required={Array.isArray(required) ? (required as string[]) : []} doneBase="/ops/b2b/customers" salespeople={salespeople} />
      </div>
    </>
  );
}
