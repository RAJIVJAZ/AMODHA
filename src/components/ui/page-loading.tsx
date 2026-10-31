// Shown instantly while the next page loads (Next.js loading.tsx), so a tap always gets a response.
export function PageLoading({ label = "Loading…", dark = false }: { label?: string; dark?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] w-full flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`h-5 w-5 animate-spin rounded-full border-[3px] ${dark ? "border-white/25 border-t-white" : "border-ink/15 border-t-ink"}`}
        />
        <span className={`text-sm font-semibold ${dark ? "text-white/80" : "text-dark/60"}`}>{label}</span>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-20 animate-pulse rounded-2xl ${dark ? "bg-white/10" : "bg-ink/5"}`} />
        ))}
      </div>
    </div>
  );
}
