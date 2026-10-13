import type { Metadata, Viewport } from "next";
import { SalesNav } from "@/components/b2b/sales-nav";
import { getSales } from "@/lib/b2b/sales";

export const metadata: Metadata = {
  title: { default: "Mithai Wallah Sales", template: "%s · Mithai Wallah Sales" },
  robots: { index: false, follow: false },
  manifest: "/sales/manifest.webmanifest",
  appleWebApp: { title: "MW Sales", capable: true, statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/ops-192.png" },
};

export const viewport: Viewport = { themeColor: "#16323f", viewportFit: "cover" };

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const s = await getSales();
  const sp = s?.salesperson;
  return (
    <div className="min-h-screen bg-[#f5f6f7]">
      {sp ? <SalesNav name={sp.full_name} code={sp.employee_code} /> : null}
      <main id="main-content" className={`mx-auto max-w-3xl px-4 py-4 ${sp ? "pb-32" : ""}`}>
        {children}
      </main>
    </div>
  );
}
