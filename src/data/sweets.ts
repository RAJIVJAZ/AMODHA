/** Prices are in INR and indicative — update with real pricing before going live. */
export type PackSize = { label: string; price: number };

export type Sweet = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string[];
  occasions: string[];
  packSizes: PackSize[];
  /** Shows the "100% Pure Desi Ghee" seal; false for items not cooked in ghee. */
  pureDesiGhee: boolean;
  metaTitle: string;
  metaDescription: string;
  color: string;
  image?: string;
  imageAlt?: string;
  gallery?: { src: string; alt: string }[];
};

export const sweets: Sweet[] = [
  {
    slug: "milk-cake",
    name: "Milk Cake",
    shortDescription:
      "Dense, caramelised milk cake slow-cooked from fresh khoya in pure desi ghee — golden, grainy and rich.",
    description: [
      "Our Milk Cake starts with fresh milk from local farmers near Prayagraj, slowly reduced into khoya and cooked with sugar in 100% pure desi ghee until the natural sugars caramelise. The result is a golden-brown centre, a dense, slightly grainy bite and a deep roasted-milk flavour.",
      "It's our most-ordered sweet for festive boxes and gifting. Like every batch we make, it's recorded and traceable, and finished with sliced almonds and pistachios.",
    ],
    occasions: ["Festive boxes", "Corporate gifting", "Wedding hampers", "Everyday treat"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 180 },
      { label: "500 g", price: 340 },
      { label: "1 kg", price: 650 },
    ],
    metaTitle: "Milk Cake in Pure Desi Ghee | Mithai Wallah Prayagraj",
    metaDescription:
      "Golden, grainy milk cake slow-cooked from fresh khoya in 100% pure desi ghee. Made fresh in Prayagraj. Order online — free delivery over ₹999.",
    color: "#f6c453",
    image: "/images/sweet-corner/milk-cake.webp",
    imageAlt: "Milk cake squares topped with sliced almonds and pistachios on a white plate",
  },
  {
    slug: "kalakand",
    name: "Kalakand",
    shortDescription:
      "Soft, moist kalakand made from fresh paneer and reduced milk — gently sweet with a delicate grainy texture.",
    description: [
      "Kalakand is made by simmering fresh paneer with reduced milk until it sets into a soft, moist, granular sweet. We keep the sweetness gentle so the fresh-milk flavour comes through.",
      "Because it's so milk-forward, kalakand shows the difference fresh farm milk makes better than almost any other sweet. Ours is cooked in pure desi ghee in a recorded, traceable batch and finished with pistachio and dried rose petals.",
    ],
    occasions: ["Festive boxes", "Corporate gifting", "Wedding hampers"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 200 },
      { label: "500 g", price: 380 },
      { label: "1 kg", price: 720 },
    ],
    metaTitle: "Fresh Kalakand Made from Farm Milk | Mithai Wallah Prayagraj",
    metaDescription:
      "Soft, moist kalakand made from fresh paneer and farm milk in pure desi ghee, finished with pistachio and rose. Made fresh in Prayagraj. Free delivery over ₹999.",
    color: "#e4defb",
    image: "/images/sweet-corner/kalakand.webp",
    imageAlt: "Kalakand squares garnished with pistachios and dried rose petals",
  },
  {
    slug: "chocolate-barfi",
    name: "Chocolate Barfi",
    shortDescription:
      "Fudgy cocoa-and-khoya barfi finished with almonds and pistachios — classic mithai with a modern twist.",
    description: [
      "Our Chocolate Barfi blends fresh khoya with real cocoa and pure desi ghee for a rich, fudgy square that sits somewhere between classic mithai and a chocolate treat.",
      "It's usually the first sweet kids and younger guests reach for, which makes it a favourite in mixed festive boxes. Topped with almonds and pistachios and made fresh in our Prayagraj kitchen.",
    ],
    occasions: ["Festive boxes", "Birthdays", "Corporate gifting"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 220 },
      { label: "500 g", price: 420 },
      { label: "1 kg", price: 800 },
    ],
    metaTitle: "Chocolate Barfi with Khoya & Desi Ghee | Mithai Wallah",
    metaDescription:
      "Fudgy chocolate barfi made with fresh khoya, real cocoa and 100% pure desi ghee. Made fresh in Prayagraj — order online, free delivery over ₹999.",
    color: "#c99b6f",
    image: "/images/sweet-corner/chocolate-barfi.webp",
    imageAlt: "Chocolate barfi squares topped with almonds and pistachios",
  },
  {
    slug: "doda-barfi",
    name: "Doda Barfi",
    shortDescription: "Dense, deeply roasted doda barfi with a firm, grainy bite and a rich ghee aroma.",
    description: [
      "Doda Barfi is made through a long, slow reduction of milk and khoya in pure desi ghee, which builds its firm, grainy texture and deep caramel-brown colour.",
      "It's for anyone who likes their mithai dense and traditional rather than soft. Finished with almonds and pistachios, made fresh in Prayagraj in traceable batches.",
    ],
    occasions: ["Festive boxes", "Wedding hampers", "Everyday treat"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 190 },
      { label: "500 g", price: 360 },
      { label: "1 kg", price: 680 },
    ],
    metaTitle: "Doda Barfi in Pure Desi Ghee | Mithai Wallah Prayagraj",
    metaDescription:
      "Dense, roasted doda barfi slow-cooked from milk and khoya in 100% pure desi ghee. Made fresh in Prayagraj in traceable batches. Order online.",
    color: "#d9b978",
    image: "/images/sweet-corner/doda-barfi.webp",
    imageAlt: "Grainy, caramel-brown doda barfi pieces garnished with almonds and pistachios",
  },
  {
    slug: "malai-barfi",
    name: "Malai Barfi",
    shortDescription: "Pale, creamy malai barfi that melts in the mouth, generously topped with pistachios.",
    description: [
      "Made from fresh malai (cream) and khoya, our Malai Barfi is softer and lighter than denser barfi — creamy, delicately sweet and melt-in-the-mouth.",
      "The fresher the cream, the better it tastes, so we make it from same-day farm milk and cook it in pure desi ghee. Finished with a generous scatter of pistachios.",
    ],
    occasions: ["Festive boxes", "Wedding hampers", "Everyday treat"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 210 },
      { label: "500 g", price: 400 },
      { label: "1 kg", price: 760 },
    ],
    metaTitle: "Malai Barfi Made with Fresh Cream | Mithai Wallah Prayagraj",
    metaDescription:
      "Soft, creamy malai barfi made from fresh farm cream and khoya in 100% pure desi ghee, topped with pistachios. Made fresh in Prayagraj. Free delivery over ₹999.",
    color: "#ffd7b5",
    image: "/images/sweet-corner/malai-barfi.webp",
    imageAlt: "Creamy malai barfi squares topped with chopped pistachios on a white plate",
  },
  {
    slug: "peda",
    name: "Peda",
    shortDescription: "Hand-shaped khoya peda with a soft crumb, a hint of cardamom and pistachio on top.",
    description: [
      "Our Peda is hand-shaped from freshly reduced khoya, cooked in pure desi ghee and finished with a hint of cardamom — the classic recipe that makes peda a festival and prasad favourite.",
      "Small enough to share and easy to gift, peda is a staple for puja, celebrations and sweet boxes. Each one is topped with pistachio and made fresh in Prayagraj.",
    ],
    occasions: ["Puja & prasad", "Festive boxes", "Corporate gifting"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 180 },
      { label: "500 g", price: 340 },
      { label: "1 kg", price: 640 },
    ],
    metaTitle: "Khoya Peda with Cardamom | Mithai Wallah Prayagraj",
    metaDescription:
      "Hand-shaped khoya peda with cardamom, cooked in 100% pure desi ghee and topped with pistachio. Perfect for puja and gifting. Made fresh in Prayagraj.",
    color: "#ffbf78",
    image: "/images/sweet-corner/peda.webp",
    imageAlt: "Round khoya peda topped with pistachio slivers on a white plate",
  },
  {
    slug: "kunda",
    name: "Kunda",
    shortDescription: "Prayagraj's own specialty — a thick, caramelised khoya sweet, rich enough to eat by the spoon.",
    description: [
      "Kunda is closely tied to Prayagraj: khoya slow-cooked with sugar until it turns a rich caramel brown, with a soft, spoonable texture and a deep, almost toffee-like flavour.",
      "We make it the traditional way, in pure desi ghee from fresh local milk. It's the sweet visitors most often ask to take home — and the one we're proudest to make right here.",
    ],
    occasions: ["Prayagraj specialty", "Gifts for family outside Prayagraj", "Festive boxes"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 220 },
      { label: "500 g", price: 420 },
      { label: "1 kg tin", price: 800 },
    ],
    metaTitle: "Kunda, Prayagraj's Specialty Sweet | Mithai Wallah",
    metaDescription:
      "Authentic Prayagraj kunda: khoya slow-cooked to a rich caramel in 100% pure desi ghee, made fresh from local farm milk. Order online in Prayagraj.",
    color: "#e3a377",
    image: "/images/sweet-corner/kunda.webp",
    imageAlt: "Kunda, a caramelised khoya sweet from Prayagraj",
  },
  {
    slug: "bikaneri-cake",
    name: "Bikaneri Cake",
    shortDescription: "A firm, layered milk sweet with rich caramel notes that keeps and travels well.",
    description: [
      "Bikaneri Cake is made through a slow reduction that builds a layered texture and a deep caramel note — firmer than milk cake, with a satisfying bite.",
      "Because it keeps well, it's a smart choice for gifting to relatives or carrying on a journey. Cooked in pure desi ghee and made fresh in our Prayagraj kitchen.",
    ],
    occasions: ["Travel-friendly gifting", "Festive boxes", "Corporate gifting"],
    pureDesiGhee: true,
    packSizes: [
      { label: "250 g", price: 200 },
      { label: "500 g", price: 380 },
      { label: "1 kg", price: 720 },
    ],
    metaTitle: "Bikaneri Cake in Pure Desi Ghee | Mithai Wallah Prayagraj",
    metaDescription:
      "Firm, layered Bikaneri cake with deep caramel notes, cooked in 100% pure desi ghee. Great for gifting. Made fresh in Prayagraj — free delivery over ₹999.",
    color: "#f2a6b0",
    image: "/images/sweet-corner/bikaneri-cake.webp",
    imageAlt: "Bikaneri cake pieces with a layered, caramelised texture",
  },
  {
    slug: "premium-dry-fruit-box",
    name: "Premium Dry Fruit Box",
    shortDescription:
      "Almonds, cashews, pistachios, walnuts and raisins in an elegant Mithai Wallah gift box — thoughtful inside, impressive outside.",
    description: [
      "Our Premium Dry Fruit Box brings together hand-picked almonds, cashews, pistachios, walnuts and raisins in an elegant Mithai Wallah gift box.",
      "It's made for the same moments as our mithai — festivals, weddings and corporate gifting — on its own or paired with a box of sweets. Ordering for a large guest list or team? Contact us for bulk pricing.",
    ],
    occasions: ["Corporate gifting", "Wedding hampers", "Festive gifting"],
    pureDesiGhee: false,
    packSizes: [
      { label: "500 g", price: 900 },
      { label: "1 kg", price: 1700 },
    ],
    metaTitle: "Premium Dry Fruit Gift Box | Mithai Wallah Prayagraj",
    metaDescription:
      "Almonds, cashews, pistachios, walnuts and raisins in an elegant Mithai Wallah gift box — for festivals, weddings and corporate gifting in Prayagraj.",
    color: "#d9b978",
    image: "/images/sweet-corner/premium-dry-fruit-box.webp",
    imageAlt:
      "Mithai Wallah navy velvet gift box with jars of almonds, cashews, pistachios, raisins, walnuts and apricots",
    gallery: [
      {
        src: "/images/sweet-corner/premium-dry-fruit-box-2.webp",
        alt: "Open coral Mithai Wallah dry fruit box with cashews, almonds, pistachios and raisins",
      },
      {
        src: "/images/sweet-corner/premium-dry-fruit-box-3.webp",
        alt: "Mithai Wallah gift box with four jars of pistachios, walnuts, cranberries and trail mix",
      },
    ],
  },
];

export function getSweet(slug: string) {
  return sweets.find((sweet) => sweet.slug === slug);
}

export function getPack(slug: string, packLabel: string) {
  return getSweet(slug)?.packSizes.find((size) => size.label === packLabel);
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
