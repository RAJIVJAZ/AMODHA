export type Sweet = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string[];
  occasions: string[];
  packSizes: string[];
  keyword: string;
};

export const sweets: Sweet[] = [
  {
    slug: "milk-cake",
    name: "Milk Cake",
    shortDescription:
      "Dense, caramelised khoya sweet with a grainy bite and a deep, roasted-milk flavour.",
    description: [
      "Our Milk Cake is slow-cooked from fresh khoya and sugar until the natural sugars caramelise, giving it a distinctive golden-brown colour and a dense, slightly grainy texture that milk cake lovers seek out.",
      "It's one of our most requested items for gifting boxes and wholesale supply to sweet shops across Uttar Pradesh.",
    ],
    occasions: ["Corporate gifting", "Wedding hampers", "Festive boxes", "Wholesale to sweet shops"],
    packSizes: ["250 g", "500 g", "1 kg", "Bulk trays (5 kg)"],
    keyword: "Milk Cake Manufacturer Prayagraj",
  },
  {
    slug: "kalakand",
    name: "Kalakand",
    shortDescription: "Soft, moist, grainy milk sweet made from fresh paneer and reduced milk.",
    description: [
      "Kalakand is made by simmering fresh paneer and milk together until it forms a soft, moist, granular sweet with a delicate sweetness that doesn't overpower the milky flavour.",
      "We finish ours with a light garnish of pistachio and silver leaf for premium gifting orders, or plain for wholesale supply.",
    ],
    occasions: ["Corporate gifting", "Wedding hampers", "Festive boxes"],
    packSizes: ["250 g", "500 g", "1 kg"],
    keyword: "Kalakand Manufacturer UP",
  },
  {
    slug: "malai-barfi",
    name: "Malai Barfi",
    shortDescription: "Rich, cream-based barfi with a melt-in-the-mouth texture.",
    description: [
      "Made from fresh malai (cream) and khoya, our Malai Barfi has a soft, delicate texture that sets it apart from denser barfi varieties, finished with a light garnish of chopped nuts.",
    ],
    occasions: ["Festive gifting", "Wedding hampers", "Retail counters"],
    packSizes: ["250 g", "500 g", "1 kg"],
    keyword: "Malai Barfi Sweet Shop Supplier",
  },
  {
    slug: "peda",
    name: "Peda",
    shortDescription: "Classic khoya peda with a soft crumb and rich, roasted flavour.",
    description: [
      "Our Peda is hand-shaped from freshly reduced khoya and finished with a hint of cardamom, staying true to the classic recipe that has made peda a festival and prasad favourite for generations.",
    ],
    occasions: ["Festive gifting", "Religious offerings/prasad", "Corporate boxes"],
    packSizes: ["250 g", "500 g", "1 kg", "Bulk (for temples/events)"],
    keyword: "Peda Manufacturer Prayagraj",
  },
  {
    slug: "kunda",
    name: "Kunda",
    shortDescription: "A Prayagraj specialty — thick, caramelised sweetened khoya, eaten by the spoon.",
    description: [
      "Kunda is a regional specialty closely associated with Prayagraj, made by slow-cooking khoya with sugar until it turns into a rich, caramel-brown, spoonable sweet with a distinctive deep flavour.",
      "It's a point of pride for us to manufacture authentic Kunda using the traditional recipe, and it's one of the most requested items by customers ordering from outside the region.",
    ],
    occasions: ["Regional specialty gifting", "Festive orders", "Wholesale"],
    packSizes: ["250 g", "500 g", "1 kg tin"],
    keyword: "Kunda Sweet Prayagraj",
  },
  {
    slug: "bikaneri-cake",
    name: "Bikaneri Cake",
    shortDescription: "A distinctive layered milk sweet with a firm bite and rich caramel notes.",
    description: [
      "Bikaneri Cake is prepared using a slow reduction process that builds layered texture and a deep caramel note, offering a firmer alternative to milk cake that travels and stores exceptionally well — making it a favourite for bulk and wholesale orders.",
    ],
    occasions: ["Wholesale to sweet shops", "Corporate gifting", "Travel-friendly gifting"],
    packSizes: ["250 g", "500 g", "1 kg", "Bulk trays"],
    keyword: "Bikaneri Cake Wholesale Supplier",
  },
];

export function getSweet(slug: string) {
  return sweets.find((sweet) => sweet.slug === slug);
}

export const hamperCategories = [
  {
    slug: "custom-mix-boxes",
    name: "Custom Mix Boxes",
    description: "Build your own assortment from our full range of sweets in a single premium box.",
  },
  {
    slug: "festival-hampers",
    name: "Festival Hampers",
    description: "Ready-curated boxes for Diwali, Holi, Raksha Bandhan and other festive occasions.",
  },
  {
    slug: "corporate-hampers",
    name: "Corporate Hampers",
    description: "Branded gift boxes for client gifting, employee rewards and business festive gifting.",
  },
  {
    slug: "wedding-hampers",
    name: "Wedding Hampers",
    description: "Personalised boxes for wedding favours, shagun and return gifts.",
  },
];
