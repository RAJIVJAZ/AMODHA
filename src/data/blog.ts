export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingTime: string;
  category: string;
  keyword: string;
  content: string[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-bilona-ghee",
    title: "What Is Bilona Ghee, and Why Does It Taste Different?",
    excerpt:
      "Most ghee sold today is made by heating cream directly. Bilona ghee is made an entirely different, slower way — here's why it matters for taste and quality.",
    date: "2026-01-12",
    readingTime: "5 min read",
    category: "Dairy Education",
    keyword: "Bilona Ghee Manufacturer",
    content: [
      "If you've ever tasted ghee made by your grandmother and wondered why it tastes so different from what you buy in a shop, the answer usually comes down to one word: bilona.",
      "Most commercial ghee is made by a shortcut process — cream is separated from milk and heated directly to produce ghee. It's fast and scalable, but it skips a crucial step: fermentation and hand-churning.",
      "The bilona method starts with curd, not cream. Fresh milk is set into curd, which is then hand-churned in a wooden bilona (churner) to separate white butter. That butter is then slow-cooked over a controlled flame until it transforms into ghee.",
      "This process takes longer and yields less ghee per litre of milk, which is why bilona ghee costs more — but it also produces a grainier texture, a deeper aroma, and a flavour that's noticeably richer than direct-cream ghee.",
      "At Amodha, every batch of our Bilona Ghee starts with fresh curd from milk collected through our own farmer network near Prayagraj, hand-churned and slow-cooked exactly the way it has been done for generations.",
    ],
  },
  {
    slug: "how-milk-cake-is-made",
    title: "From Milk to Milk Cake: Inside a Traditional Mithai Kitchen",
    excerpt:
      "Milk cake looks simple, but getting the caramelisation and texture right takes years of practice. Here's how it's made in a working sweets kitchen.",
    date: "2026-02-03",
    readingTime: "4 min read",
    category: "Sweet Making",
    keyword: "Milk Cake Manufacturer",
    content: [
      "Milk Cake is deceptively simple to describe — reduced milk cooked with sugar until it caramelises — but getting the texture right is a skill that takes our halwais years to master.",
      "It starts with khoya, made by slow-reducing fresh whole milk over direct heat until the moisture cooks off and only the milk solids remain. This khoya is then cooked again with sugar over a low flame, stirred continuously, until the natural sugars begin to caramelise.",
      "Timing matters enormously here. Too little cooking and the milk cake stays pale and soft; too much and it turns hard and overly dark. The right batch has a deep golden-brown colour, a dense but yielding texture, and a slightly grainy bite.",
      "Because it's a slow, hands-on process, we make Milk Cake fresh in batches rather than mass-producing it — which is also why our sweet shop and wholesale partners tell us the taste stays consistent order after order.",
    ],
  },
  {
    slug: "corporate-gifting-mithai-guide",
    title: "A Buyer's Guide to Corporate Sweet Gift Boxes",
    excerpt:
      "Ordering mithai for corporate gifting in bulk? Here's what to check before you commit — from shelf life to packaging to minimum order quantities.",
    date: "2026-02-20",
    readingTime: "6 min read",
    category: "Corporate Gifting",
    keyword: "Corporate Sweet Gift Boxes",
    content: [
      "Corporate gifting season brings a wave of last-minute mithai orders, and getting it wrong — soggy packaging, inconsistent quality, missed delivery dates — reflects directly on your brand.",
      "Shelf life is the first thing to check. Milk-based sweets like kalakand and malai barfi have a shorter shelf life than khoya-based sweets like milk cake and Bikaneri cake, which travel and store better for gifting that needs to reach recipients across cities.",
      "Packaging matters as much as the sweet itself. A premium rigid box or magnetic box with your company's branding communicates far more than a plain mono carton, even if the product inside is identical.",
      "Always confirm minimum order quantities and lead times well in advance — bulk custom-branded boxes typically need 7-15 days of lead time depending on the customisation involved (logo printing, gold foiling, or fully custom boxes).",
      "At Amodha, our Corporate Gifting team works directly with procurement and admin teams to finalise box design, quantity and delivery timelines, with Pan-India dispatch for bulk corporate orders.",
    ],
  },
  {
    slug: "wedding-sweet-box-ideas",
    title: "5 Wedding Sweet Box Ideas That Guests Actually Remember",
    excerpt:
      "Wedding return gifts are easy to forget — unless the mithai box is genuinely memorable. Here are ideas that go beyond the standard barfi box.",
    date: "2026-03-05",
    readingTime: "5 min read",
    category: "Wedding Gifting",
    keyword: "Wedding Sweet Boxes",
    content: [
      "Wedding sweet boxes are one of the last things guests take home — which makes them one of the last impressions of your wedding they'll remember.",
      "1. Personalised name boxes: Printing the bride and groom's names (and wedding date) directly on the box turns a standard gift into a keepsake.",
      "2. Colour-matched packaging: Matching the box colour and ribbon to your wedding theme creates a cohesive, thoughtful feel across every part of the celebration.",
      "3. Mixed-assortment boxes: Instead of a single sweet, a curated mix of 3-4 varieties (like milk cake, kalakand and peda) gives guests more to enjoy.",
      "4. Regional specialty additions: Including a regional specialty like Kunda alongside classic favourites gives out-of-town guests something distinctive to try.",
      "5. Premium finishing touches: Gold foiling, embossed initials, or a small handwritten gift note elevate even a modestly priced box into something that feels luxurious.",
      "Our Wedding Gifting team can walk you through box sizes, sweet combinations and customisation options — from a small trial box to thousands of units for a large guest list.",
    ],
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
