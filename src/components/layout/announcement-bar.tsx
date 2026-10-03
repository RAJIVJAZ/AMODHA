import { formatInr } from "@/lib/currency";
import { DELIVERY_AREA, FREE_DELIVERY_THRESHOLD } from "@/lib/order-rules";

export function AnnouncementBar() {
  return (
    <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-blush sm:text-sm">
      🚚 Free delivery in {DELIVERY_AREA} on orders {formatInr(FREE_DELIVERY_THRESHOLD)}+
      <span className="hidden sm:inline"> · 100% pure desi ghee · Traceable batches</span>
    </div>
  );
}
