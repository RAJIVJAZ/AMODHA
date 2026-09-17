import { ButtonLink } from "@/components/ui/button-link";

export default function NotFound() {
  return (
    <section className="container-site flex flex-col items-center gap-6 py-28 text-center">
      <span className="font-heading text-6xl font-bold text-gold/50 sm:text-7xl">404</span>
      <h1 className="text-3xl font-bold text-brown sm:text-4xl">Page Not Found</h1>
      <p className="max-w-md text-dark/70">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved. Let&rsquo;s get you back
        on track.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <ButtonLink href="/" variant="primary">
          Back to Home
        </ButtonLink>
        <ButtonLink href="/sweet-corner" variant="ghost">
          Explore Sweet Corner
        </ButtonLink>
      </div>
    </section>
  );
}
