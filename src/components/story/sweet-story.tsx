import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { GheeSeal } from "@/components/ui/ghee-seal";
import { sweets } from "@/data/sweets";
import { formatInr } from "@/lib/currency";
import { FIRST_ORDER_DISCOUNT, FIRST_ORDER_MINIMUM } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";
import { StoryStage } from "./story-stage";

// The homepage's scroll story: five chapters of real text and links, with the 3D scene (StoryStage) pinned
// behind them. Each chapter fills the screen; on wide screens the text sits on the left and the 3D on the
// right, on phones the text sits on top and the 3D below it.

const PACKS = ["250 g", "500 g", "1 kg"] as const;

function fromPrice(label: string) {
  const prices = sweets.flatMap((s) => s.packSizes.filter((p) => p.label === label).map((p) => p.price));
  return prices.length ? Math.min(...prices) : null;
}

/** A torn-paper edge in the colour of the section it belongs to. */
function TornEdge({ color, side }: { color: string; side: "top" | "bottom" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 40"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute left-0 h-6 w-full sm:h-10 ${side === "top" ? "-top-[1.4rem] sm:-top-[2.4rem]" : "-bottom-[1.4rem] rotate-180 sm:-bottom-[2.4rem]"}`}
      style={{ color }}
    >
      <path
        fill="currentColor"
        d="M0 40 L0 22 L40 16 L75 25 L120 12 L160 20 L205 9 L250 21 L300 14 L340 24 L390 10 L430 19 L480 7 L525 18 L570 13 L615 25 L660 11 L705 20 L750 8 L800 22 L845 15 L890 24 L935 10 L980 19 L1030 12 L1075 23 L1120 14 L1160 21 L1200 13 L1200 40 Z"
      />
    </svg>
  );
}

const chapter = "relative flex min-h-[100svh] items-start pb-[52svh] pt-24 lg:items-center lg:py-28";
const textCol = "container-site relative z-20";
const textBox = "max-w-xl lg:max-w-[46%]";
const fallback = "hidden group-data-[story3d=off]/story:block";

export function SweetStory({ accountsLive }: { accountsLive: boolean }) {
  return (
    <>
      <div data-story data-story3d="pending" className="group/story relative">
        <noscript>
          <style>{`[data-story] .story-fallback{display:block !important}[data-story] .story-fallback.grid-cols-2{display:grid !important}`}</style>
        </noscript>
        <StoryStage />

        {/* 1. Hero */}
        <section data-story-chapter className={`${chapter} bg-blush`}>
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
          <div className={textCol}>
            <div className={`${textBox} flex flex-col gap-5`}>
              <span className="font-heading sticker-shadow-sm inline-block w-fit rounded-full border-2 border-ink bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink sm:text-sm">
                Made fresh in Prayagraj since {siteConfig.founded}
              </span>
              <h1 className="text-balance text-4xl font-bold leading-[1.05] text-ink sm:text-5xl lg:text-6xl">
                Pure Desi Ghee Sweets, <span className="text-accent">Made Fresh</span> in Prayagraj
              </h1>
              <p className="text-balance text-base text-ink/75 sm:text-lg">
                Fresh milk from around 100 local farmers, cooked in 100% pure desi ghee in a hygienic kitchen — every batch recorded and
                traceable. Delivered across Prayagraj, free on orders ₹999+.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="#catalog" variant="primary">
                  Order Sweets
                </ButtonLink>
                <ButtonLink href="/corporate-gifting" variant="ghost">
                  Corporate Gifting
                </ButtonLink>
              </div>
              {accountsLive ? (
                <Link
                  href="/login?next=/checkout"
                  className="font-heading w-fit text-sm font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4"
                >
                  🎉 {formatInr(FIRST_ORDER_DISCOUNT)} off your first order above {formatInr(FIRST_ORDER_MINIMUM)} — sign up in a minute
                </Link>
              ) : null}
              <p className="font-subheading hidden text-sm italic text-ink/50 lg:block" aria-hidden="true">
                Scroll to see what goes into every box ↓
              </p>
            </div>
            <div className={`story-fallback ${fallback} relative mt-10 max-w-md`}>
              <div className="sticker-shadow overflow-hidden rounded-3xl border-[2.5px] border-ink">
                <Image
                  src="/images/sweet-corner/assorted-gift-box.webp"
                  alt="Mithai Wallah sweet box with Milk Cake, Kalakand, Chocolate Barfi, Doda Barfi and Peda"
                  width={1370}
                  height={1148}
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  priority
                  className="h-auto w-full"
                />
              </div>
              <GheeSeal idPrefix="story-seal" className="absolute -right-4 -top-8 h-24 w-24 rotate-[-10deg] drop-shadow-md" />
            </div>
          </div>
        </section>

        {/* 2. Two favourites */}
        <section data-story-chapter className={`${chapter} bg-[#f6dc8f]`}>
          <TornEdge color="#f6dc8f" side="top" />
          <div className={textCol}>
            <div className={`${textBox} flex flex-col gap-5`}>
              <p className="font-subheading text-lg italic text-ink/70">Our two bestsellers</p>
              <h2 className="text-balance text-3xl font-bold leading-tight text-ink sm:text-5xl">
                Two favourites. <span className="text-accent-dark">One honest kitchen.</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/sweet-corner/milk-cake"
                  className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white/90 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <span className="font-heading block text-lg font-bold text-ink">Milk Cake</span>
                  <span className="font-subheading block text-sm italic text-ink/70">
                    Milk slow-cooked for hours until the centre caramelises.
                  </span>
                </Link>
                <Link
                  href="/sweet-corner/kalakand"
                  className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white/90 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <span className="font-heading block text-lg font-bold text-ink">Kalakand</span>
                  <span className="font-subheading block text-sm italic text-ink/70">
                    Soft and grainy, made the same morning, finished with pistachio.
                  </span>
                </Link>
              </div>
            </div>
            <div className="story-fallback mt-8 hidden max-w-md grid-cols-2 gap-3 group-data-[story3d=off]/story:grid">
              {["milk-cake", "kalakand"].map((slug) => (
                <Image
                  key={slug}
                  src={`/images/sweet-corner/${slug}.webp`}
                  alt=""
                  width={1254}
                  height={1254}
                  sizes="45vw"
                  className="sticker-shadow-sm rounded-2xl border-2 border-ink"
                />
              ))}
            </div>
          </div>
        </section>

        {/* 3. Pick your box */}
        <section data-story-chapter className={`${chapter} bg-[#fffaf2]`}>
          <TornEdge color="#fffaf2" side="top" />
          <div className={textCol}>
            <div className={`${textBox} flex flex-col gap-5`}>
              <p className="font-subheading text-lg italic text-ink/70">Every sweet, three sizes</p>
              <h2 className="text-balance text-3xl font-bold leading-tight text-ink sm:text-5xl">
                Pick your <span className="text-accent">box.</span>
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {PACKS.map((label) => {
                  const price = fromPrice(label);
                  return (
                    <Link
                      key={label}
                      href="#catalog"
                      className="sticker-shadow-sm flex flex-col rounded-2xl border-2 border-ink bg-white p-3 text-center transition-transform hover:-translate-y-0.5 sm:p-4"
                    >
                      <span className="font-heading text-xl font-bold text-ink sm:text-2xl">{label}</span>
                      {price ? <span className="text-xs text-ink/60 sm:text-sm">from {formatInr(price)}</span> : null}
                    </Link>
                  );
                })}
              </div>
              <ButtonLink href="#catalog" variant="primary" className="w-fit">
                Choose sweets
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* 4. Boxed with care */}
        <section data-story-chapter className={`${chapter} bg-ink text-white`}>
          <TornEdge color="#16323f" side="top" />
          <div className={textCol}>
            <div className={`${textBox} flex flex-col gap-6`}>
              <p className="font-subheading text-lg italic text-primary-light">From our kadhai to your table</p>
              <h2 className="text-balance text-3xl font-bold leading-tight sm:text-5xl">
                Your sweets, <span className="text-[#f6dc8f]">boxed with care.</span>
              </h2>
              <ol className="flex flex-col gap-4">
                {[
                  ["Made fresh that morning", "Small batches, never from a warehouse."],
                  ["Packed in sealed, food-safe boxes", "Gloved, masked team in an FSSAI-licensed kitchen."],
                  ["Delivered across Prayagraj", "Free delivery on orders of ₹999 and above."],
                ].map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="font-heading flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6dc8f] text-sm font-bold text-ink">
                      {i + 1}
                    </span>
                    <span>
                      <span className="font-heading block font-semibold">{title}</span>
                      <span className="block text-sm text-white/70">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className={`story-fallback ${fallback} mt-8 max-w-md`}>
              <Image
                src="/images/sweet-corner/packaging-ivory-gold.webp"
                alt=""
                width={835}
                height={1883}
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="aspect-[4/3] w-full rounded-3xl border-2 border-white/20 object-cover"
              />
            </div>
          </div>
        </section>
      </div>
      {/* 5. The kitchen */}
      <section className="relative bg-[#f6dc8f] py-24 lg:py-28">
        <TornEdge color="#f6dc8f" side="top" />
        <div className="container-site relative z-20 flex flex-col items-center gap-8 text-center">
          <p className="font-subheading text-lg italic text-ink/70">Come and see</p>
          <h2 className="text-balance text-3xl font-bold leading-tight text-ink sm:text-5xl">Meet the kitchen behind the sweets.</h2>
          <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
            {[
              ["/images/sweet-corner/production-facility.webp", "Mithai Wallah's production kitchen in Prayagraj"],
              ["/images/sweet-corner/ghee-pour-quality.webp", "Pure desi ghee being poured during cooking"],
            ].map(([src, alt], i) => (
              <div
                key={src}
                className={`sticker-shadow overflow-hidden rounded-3xl border-[2.5px] border-ink ${i === 0 ? "sm:-rotate-1" : "sm:rotate-1"}`}
              >
                <Image
                  src={src}
                  alt={alt}
                  width={1148}
                  height={1371}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="aspect-[3/2] h-auto w-full object-cover"
                />
              </div>
            ))}
          </div>
          <ButtonLink href="/our-process" variant="primary">
            See how we make them
          </ButtonLink>
        </div>
        <TornEdge color="#f6dc8f" side="bottom" />
      </section>
    </>
  );
}
