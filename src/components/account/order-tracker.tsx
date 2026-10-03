import { trackingSteps, type OrderStatus } from "@/lib/order-status";

export function OrderTracker({ status }: { status: OrderStatus }) {
  const current = trackingSteps.findIndex((step) => step.status === status);

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {trackingSteps.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step.status} className="flex flex-col items-center gap-2 text-center">
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink text-sm font-bold ${
                done ? "bg-accent text-white" : "bg-white text-ink/40"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={`text-xs font-semibold sm:text-sm ${done ? "text-ink" : "text-dark/45"}`}>
              {step.label}
              {index === current ? <span className="sr-only"> (current step)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
