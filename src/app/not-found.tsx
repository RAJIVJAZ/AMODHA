import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ButtonLink } from "@/components/ui/button-link";
import { CartProvider } from "@/lib/cart-context";

export default function NotFound() {
  return (
    <CartProvider>
      <Header />
      <main id="main-content" className="flex-1">
        <section className="container-site flex flex-col items-center gap-6 py-28 text-center">
          <span className="font-heading text-6xl font-bold text-primary/50 sm:text-7xl">404</span>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">Page Not Found</h1>
          <p className="max-w-md text-dark/70">
            The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved. Let&rsquo;s get you back
            on track.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <ButtonLink href="/" variant="primary">
              Back to Home
            </ButtonLink>
            <ButtonLink href="/#catalog" variant="ghost">
              Browse Our Sweets
            </ButtonLink>
          </div>
        </section>
      </main>
      <Footer />
    </CartProvider>
  );
}
