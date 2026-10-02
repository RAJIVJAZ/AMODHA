export const siteConfig = {
  name: "Mithai Wallah",
  legalName: "Anuradha Enterprises",
  tagline: "A Taste of Prayagraj",
  description:
    "Pure desi ghee sweets made fresh in Prayagraj with milk from 100+ local farmers — milk cake, kalakand, barfi, peda, kunda and more. Every batch recorded and traceable. Free delivery in Prayagraj on orders ₹999+.",
  comingSoonQuote: "The purity you want will be arriving soon.",
  url: "https://mithaiwallah.shop",
  locale: "en_IN",
  address: {
    office: {
      label: "Registered Office",
      line1: "594A/371A, Mutthiganj, Salikgram",
      line2: "Jaiswal Nagar",
      city: "Prayagraj",
      state: "Uttar Pradesh",
      postalCode: "211003",
      country: "India",
    },
    plant: {
      label: "Manufacturing Plant",
      line1: "53/2, Surwal Sahini, Naribari",
      line2: "Rewa Road",
      city: "Prayagraj",
      state: "Uttar Pradesh",
      postalCode: "212106",
      country: "India",
    },
  },
  contact: {
    phone: "+91 70074 24542",
    phoneHref: "+917007424542",
    whatsapp: "917007424542",
    email: "support@mithaiwallah.shop",
  },
  /** Leave empty until the real profile URL is known; empty entries are hidden. */
  social: {
    instagram: "",
    facebook: "",
    youtube: "",
  },
  /**
   * Turn on once SMS is set up in Supabase (Authentication → Sign In / Providers → Phone).
   * Shows the account link in the header and the first-order offer banner.
   */
  accountsLive: false,
  /** Paste the Google Form "Send → link" URL here; until then the milk page collects interest via WhatsApp. */
  dairyInterestFormUrl: "",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=53/2+Surwal+Sahini+Naribari+Rewa+Road+Prayagraj+212106&output=embed",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=53%2F2+Surwal+Sahini+Naribari+Rewa+Road+Prayagraj+212106",
  officeMapsUrl:
    "https://www.google.com/maps/search/?api=1&query=594A%2F371A+Mutthiganj+Salikgram+Jaiswal+Nagar+Prayagraj+211003",
  founded: "2023",
  stats: {
    farmers: "100+",
    customers: "200+",
  },
};

export const mainNav = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Our Process", href: "/our-process" },
  { label: "Fresh Milk", href: "/milk-subscription" },
  { label: "Membership", href: "/membership" },
  { label: "Corporate Gifting", href: "/corporate-gifting" },
  { label: "Wholesale", href: "/wholesale" },
  { label: "Contact", href: "/contact" },
];

export const footerNav = {
  products: [
    { label: "Fresh Milk Subscription", href: "/milk-subscription" },
    { label: "Bilona Ghee", href: "/dairy-products/ghee" },
    { label: "Paneer", href: "/dairy-products/paneer" },
    { label: "Butter", href: "/dairy-products/butter" },
    { label: "Milk", href: "/dairy-products/milk" },
    { label: "Cream", href: "/dairy-products/cream" },
    { label: "Curd", href: "/dairy-products/curd" },
    { label: "Khoya", href: "/dairy-products/khoya" },
  ],
  sweets: [
    { label: "Milk Cake", href: "/sweet-corner/milk-cake" },
    { label: "Kalakand", href: "/sweet-corner/kalakand" },
    { label: "Chocolate Barfi", href: "/sweet-corner/chocolate-barfi" },
    { label: "Doda Barfi", href: "/sweet-corner/doda-barfi" },
    { label: "Malai Barfi", href: "/sweet-corner/malai-barfi" },
    { label: "Peda", href: "/sweet-corner/peda" },
    { label: "Kunda", href: "/sweet-corner/kunda" },
    { label: "Bikaneri Cake", href: "/sweet-corner/bikaneri-cake" },
    { label: "Premium Dry Fruit Box", href: "/sweet-corner/premium-dry-fruit-box" },
  ],
  company: [
    { label: "About Us", href: "/about" },
    { label: "Membership", href: "/membership" },
    { label: "Our Process", href: "/our-process" },
    { label: "Blog", href: "/blog" },
    { label: "FAQs", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ],
  business: [
    { label: "Corporate Gifting", href: "/corporate-gifting" },
    { label: "Wedding Gifting", href: "/wedding-gifting" },
    { label: "Wholesale & Dealer Enquiry", href: "/wholesale" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Refund Policy", href: "/refund-policy" },
    { label: "Shipping Policy", href: "/shipping-policy" },
  ],
};
