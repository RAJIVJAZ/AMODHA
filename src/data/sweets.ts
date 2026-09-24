export type Sweet = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string[];
  occasions: string[];
  packSizes: string[];
  keyword: string;
  color: string;
  image?: string;
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
    color: "#f6c453",
    image: "/images/sweet-corner/milk-cake.webp",
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
    color: "#e4defb",
    image: "/images/sweet-corner/kalakand.webp",
  },
  {
    slug: "chocolate-barfi",
    name: "Chocolate Barfi",
    shortDescription: "Cocoa-rich khoya barfi finished with silver leaf, almonds and pistachios.",
    description: [
      "Our Chocolate Barfi blends fresh khoya with real cocoa for a rich, fudgy square that bridges classic mithai and modern taste, finished with silver leaf and a scatter of almonds and pistachios.",
      "A popular choice for gifting boxes where customers want something familiar with a contemporary twist.",
    ],
    occasions: ["Corporate gifting", "Wedding hampers", "Festive boxes"],
    packSizes: ["250 g", "500 g", "1 kg"],
    keyword: "Chocolate Barfi Manufacturer Prayagraj",
    color: "#c99b6f",
    image: "/images/sweet-corner/chocolate-barfi.webp",
  },
  {
    slug: "doda-barfi",
    name: "Doda Barfi",
    shortDescription: "Classic slow-reduced milk barfi with a firm, grainy texture and deep ghee aroma.",
    description: [
      "Doda Barfi is prepared through a long, slow reduction of milk and khoya, building a firm, grainy texture and a deep, roasted aroma that sets it apart from softer barfi varieties.",
      "Finished with almonds and pistachios, it's a favourite for customers who prefer a denser, more traditional bite.",
    ],
    occasions: ["Festive gifting", "Wedding hampers", "Wholesale to sweet shops"],
    packSizes: ["250 g", "500 g", "1 kg", "Bulk trays"],
    keyword: "Doda Barfi Sweet Shop Supplier",
    color: "#d9b978",
    image: "/images/sweet-corner/doda-barfi.webp",
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
    color: "#ffd7b5",
    image: "/images/sweet-corner/malai-barfi.webp",
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
    color: "#ffbf78",
    image: "/images/sweet-corner/peda.webp",
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
    color: "#e3a377",
    image: "/images/sweet-corner/kunda.webp",
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
    color: "#f2a6b0",
    image: "/images/sweet-corner/bikaneri-cake.webp",
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
