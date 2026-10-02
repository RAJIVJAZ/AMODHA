"use client";

import { useEffect, useState } from "react";

export type FirstOrderOffer = { signedIn: boolean; eligible: boolean };

/** Whether the signed-in customer still has the first-order discount. The server re-checks at checkout. */
export function useFirstOrderOffer() {
  const [offer, setOffer] = useState<FirstOrderOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/first-order")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setOffer({ signedIn: Boolean(data.signedIn), eligible: Boolean(data.eligible) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return offer;
}
