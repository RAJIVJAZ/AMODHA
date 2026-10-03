export type Review = {
  name: string;
  area: string;
  quote: string;
};

/**
 * Only add genuine reviews from real customers, with their permission (for example,
 * copied from your Google Business Profile). The homepage reviews section stays hidden
 * while this list is empty.
 */
export const reviews: Review[] = [];
