export type ProductSceneKind = "pour" | "sizzle" | "churn" | "splash" | "swirl" | "ripple" | "reduce";

export type DairyProduct = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string[];
  highlights: string[];
  packSizes: string[];
  keyword: string;
  motif: string;
  sceneKind: ProductSceneKind;
  sceneCaption: string;
};

export const dairyProducts: DairyProduct[] = [
  {
    slug: "ghee",
    name: "Bilona Ghee",
    shortDescription:
      "Hand-churned using the traditional bilona method — slow, patient, and true to the way our grandmothers made it.",
    description: [
      "Our Bilona Ghee is made the way ghee was always meant to be made — from curd that is hand-churned into butter and then slow-cooked over a controlled flame until it turns into deep golden, grainy ghee with a rich aroma.",
      "We source milk directly from our network of over 1,000 partner farmers across villages near Prayagraj, ensuring every batch starts with fresh, wholesome milk rather than industrial cream.",
      "No shortcuts, no direct cream separation, no additives — just the same process that has been trusted in Indian households for generations, now produced under strict food-safety standards.",
    ],
    highlights: [
      "Traditional bilona (hand-churned) method",
      "Made from farm-fresh curd, not centrifuged cream",
      "Rich, grainy texture with authentic aroma",
      "FSSAI certified manufacturing facility",
    ],
    packSizes: ["200 ml", "500 ml", "1 litre", "5 litre (bulk)", "15 litre (catering)"],
    keyword: "Bilona Ghee Manufacturer Prayagraj",
    motif: "🫙",
    sceneKind: "pour",
    sceneCaption: "Hand-churned. Slow-poured. Pure.",
  },
  {
    slug: "paneer",
    name: "Fresh Paneer",
    shortDescription:
      "Soft, spongy, and cut fresh daily from whole milk — the way paneer should taste.",
    description: [
      "Amodha Paneer is made fresh every day from full-cream cow and buffalo milk, curdled naturally and pressed to the perfect firmness — soft enough to melt in a curry, firm enough to hold its shape on skewers.",
      "We supply loose paneer to sweet shops and restaurants as well as vacuum-sealed retail blocks for households, maintaining an unbroken cold chain from our facility to your kitchen.",
      "Because we control the entire process from milk collection to cutting, we can guarantee consistency of fat content and texture — something restaurants and hotels depend on for repeat orders.",
    ],
    highlights: [
      "Made fresh daily, never frozen",
      "High protein, low moisture, no added preservatives",
      "Available loose (bulk) and vacuum-packed (retail)",
      "Consistent fat percentage for hotel & restaurant use",
    ],
    packSizes: ["200 g", "500 g", "1 kg", "5 kg (HoReCa)", "10 kg (bulk/wholesale)"],
    keyword: "Paneer Supplier Uttar Pradesh",
    motif: "🧊",
    sceneKind: "sizzle",
    sceneCaption: "Cut fresh. Cooks firm. Never frozen.",
  },
  {
    slug: "butter",
    name: "White & Table Butter",
    shortDescription: "Churned from fresh cream with a clean, milky taste and smooth spreadability.",
    description: [
      "Our white butter is churned in small batches from fresh, unsalted cream — the same butter that goes into our own bilona ghee production, sold directly for households that prefer to cook or churn their own ghee at home.",
      "We also produce table butter for bakeries, halwais and restaurants, made to a consistent fat and moisture specification suitable for lamination, baking and tempering.",
    ],
    highlights: [
      "Churned from fresh cream, not reconstituted",
      "Available salted and unsalted",
      "Bulk formats for bakeries and sweet shops",
      "Cold-chain delivery",
    ],
    packSizes: ["100 g", "500 g", "1 kg", "5 kg (bakery/bulk)"],
    keyword: "White Butter Manufacturer Prayagraj",
    motif: "🧈",
    sceneKind: "churn",
    sceneCaption: "Churned slow, from fresh cream — nothing reconstituted.",
  },
  {
    slug: "milk",
    name: "Farm Fresh Milk",
    shortDescription: "Chilled, tested, and delivered from our own collection network within hours.",
    description: [
      "Every drop of milk at Amodha is collected from our partner farmers, tested at the collection centre for fat, SNF and quality, and chilled immediately to preserve freshness before it reaches our processing unit.",
      "We offer full-cream, toned and double-toned milk options for households, and bulk chilled milk supply for hotels, sweet shops and institutional kitchens.",
    ],
    highlights: [
      "Farm-to-chiller within hours of milking",
      "Fat & SNF tested at every collection centre",
      "Full-cream, toned & double-toned variants",
      "Daily doorstep and bulk institutional supply",
    ],
    packSizes: ["500 ml", "1 litre", "5 litre (bulk can)", "20 litre (institutional)"],
    keyword: "Fresh Milk Supplier Prayagraj",
    motif: "🥛",
    sceneKind: "splash",
    sceneCaption: "Farm to chiller within hours — tested, then poured.",
  },
  {
    slug: "cream",
    name: "Fresh Cream",
    shortDescription: "Thick, rich cream separated fresh — perfect for desserts, curries and whipping.",
    description: [
      "Our fresh cream is separated from whole milk in small batches to retain a rich, thick consistency, ideal for kitchens that need reliable fat content for whipping, cooking or dessert-making.",
      "Available in retail tubs for home bakers and larger formats for hotels, bakeries and confectioners.",
    ],
    highlights: [
      "High fat content for reliable whipping",
      "No stabilisers or thickening agents",
      "Retail and bulk hospitality packs",
    ],
    packSizes: ["200 ml", "500 ml", "1 litre", "5 litre (bulk)"],
    keyword: "Fresh Dairy Cream Supplier UP",
    motif: "🍦",
    sceneKind: "swirl",
    sceneCaption: "Thick, rich, and whipped fresh — no stabilisers.",
  },
  {
    slug: "curd",
    name: "Curd (Dahi)",
    shortDescription: "Set curd with a smooth, creamy texture and a naturally tangy taste.",
    description: [
      "Amodha Curd is set the traditional way from fresh, pasteurised milk, giving it a naturally thick, smooth texture and a mild tang that doesn't overpower a meal.",
      "We supply both retail cups and bulk curd for caterers, hotels and sweet shops that use curd as a base ingredient.",
    ],
    highlights: [
      "Set using traditional culturing methods",
      "Smooth texture, naturally mild tang",
      "Retail cups and bulk catering tubs",
    ],
    packSizes: ["200 g", "400 g", "1 kg", "5 kg (bulk)"],
    keyword: "Curd Dahi Manufacturer Prayagraj",
    motif: "🥣",
    sceneKind: "ripple",
    sceneCaption: "Set the traditional way — smooth, thick, mildly tangy.",
  },
  {
    slug: "khoya",
    name: "Khoya / Mawa",
    shortDescription: "Slow-reduced whole milk solids — the backbone of every great mithai.",
    description: [
      "Khoya is the heart of Indian sweet-making, and ours is reduced slowly from fresh whole milk over direct heat until it reaches the right grain and moisture for milk cake, peda, gujiya and barfi.",
      "As our own sweet-making unit consumes large quantities of khoya daily, we produce it at scale with consistent quality — and supply the surplus to other halwais and sweet shops who trust Amodha's khoya for their own mithai.",
    ],
    highlights: [
      "Reduced fresh daily from whole milk",
      "Consistent grain & moisture for mithai making",
      "Trusted by other halwais and sweet shops",
    ],
    packSizes: ["500 g", "1 kg", "5 kg (bulk)", "10 kg (wholesale)"],
    keyword: "Khoya Mawa Supplier Prayagraj",
    motif: "🍮",
    sceneKind: "reduce",
    sceneCaption: "Slow-reduced from whole milk — the base of every great mithai.",
  },
];

export function getDairyProduct(slug: string) {
  return dairyProducts.find((product) => product.slug === slug);
}
