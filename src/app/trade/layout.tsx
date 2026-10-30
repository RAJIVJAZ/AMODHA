import type { Metadata, Viewport } from "next";
import { TradeShell } from "@/components/b2b/trade-shell";
import { getMe } from "./_lib/data";

export const metadata: Metadata = {
  title: { default: "Mithai Wallah Wholesale", template: "%s · Mithai Wallah Wholesale" },
  description: "Wholesale ordering for sweet shops from Anuradha Enterprises (Mithai Wallah), Prayagraj.",
  robots: { index: false, follow: false },
  manifest: "/trade/manifest.webmanifest",
  appleWebApp: { title: "MW Wholesale", capable: true, statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/trade-apple-180.png" },
};

export const viewport: Viewport = { themeColor: "#16323f", viewportFit: "cover" };

export default async function TradeLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const customer = me.state === "active" || me.state === "suspended" ? me : null;
  return (
    <TradeShell
      shopName={customer?.customer.shop_name ?? null}
      customerCode={customer?.customer.customer_code ?? null}
      showTabs={Boolean(customer)}
      signedIn={me.state !== "signed_out"}
      unread={customer?.unread ?? 0}
    >
      {children}
    </TradeShell>
  );
}
