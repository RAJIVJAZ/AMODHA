"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Meta (Facebook / Instagram) Pixel for the public shop only: it is mounted by the storefront layout, so the
// staff (/ops), sales (/sales), wholesale (/trade) apps and invoices never load it, and it is skipped on the
// staff admin page. Counts page views, including pages opened without a full reload.
export const META_PIXEL_ID = "1816416986248995";

type Fbq = (...args: unknown[]) => void;

export function MetaPixel() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);
  const excluded = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (excluded) return;
    // The first page view is sent by the base code below; later navigations are sent here.
    if (lastTracked.current === null) {
      lastTracked.current = pathname;
      return;
    }
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    (window as unknown as { fbq?: Fbq }).fbq?.("track", "PageView");
  }, [pathname, excluded]);

  if (excluded) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
