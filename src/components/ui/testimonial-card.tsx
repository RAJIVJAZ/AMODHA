type TestimonialCardProps = {
  name: string;
  role: string;
  quote: string;
  rating: number;
};

export function TestimonialCard({ name, role, quote, rating }: TestimonialCardProps) {
  return (
    <figure className="sticker-shadow flex h-full flex-col justify-between rounded-2xl border-2 border-ink bg-white p-6">
      <div>
        <div aria-label={`${rating} out of 5 stars`} className="mb-3 flex gap-0.5 text-accent">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} aria-hidden="true">
              {i < rating ? "★" : "☆"}
            </span>
          ))}
        </div>
        <blockquote className="font-subheading text-lg italic leading-relaxed text-dark/80">
          &ldquo;{quote}&rdquo;
        </blockquote>
      </div>
      <figcaption className="mt-5 border-t-2 border-dashed border-ink/15 pt-4">
        <div className="font-heading font-bold text-ink">{name}</div>
        <div className="text-sm text-dark/60">{role}</div>
      </figcaption>
    </figure>
  );
}
