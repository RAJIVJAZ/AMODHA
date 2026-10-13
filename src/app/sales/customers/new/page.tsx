import Link from "next/link";
import { CustomerForm } from "@/components/b2b/customer-form";
import { requireSales } from "@/lib/b2b/sales";

export const metadata = { title: "Add new B2B customer" };

export default async function NewCustomer() {
  const { supabase } = await requireSales();
  const { data } = await supabase.rpc("b2b_required_fields");
  const required = Array.isArray(data) ? (data as string[]) : [];
  return (
    <>
      <Link href="/sales/customers" className="text-sm font-semibold text-primary-dark">
        ← Shops
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-bold text-ink">Add new B2B customer</h1>
      <p className="mb-4 text-sm text-dark/65">
        Saved as a lead. The shop gets wholesale prices, credit and app access only after the office approves it.
      </p>
      <CustomerForm mode="sales" required={required} doneBase="/sales/customers" />
    </>
  );
}
