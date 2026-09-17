type TestimonialCardProps = {
  name: string;
  role: string;
  quote: string;
  rating: number;
};

export function TestimonialCard({ name, role, quote, rating }: TestimonialCardProps) {
  return (
    <figure className="flex h-full flex-col justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gold/15">
      <div>
        <div aria-label={`${rating} out of 5 stars`} className="mb-3 flex gap-0.5 text-gold">
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
      <figcaption className="mt-5 border-t border-gold/15 pt-4">
        <div className="font-semibold text-brown">{name}</div>
        <div className="text-sm text-dark/60">{role}</div>
      </figcaption>
    </figure>
  );
}
