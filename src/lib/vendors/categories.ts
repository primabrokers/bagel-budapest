/**
 * The category list every vendor/expense category `Select` in this app draws from.
 * `bm_vendors.category` / `bm_expenses.category` are plain `text` columns (no DB check
 * constraint — see migration 5), so a family can still type something outside this list on the
 * rare vendor that doesn't fit; this is the curated set the picker offers first, not a closed
 * enum enforced anywhere.
 */
export const VENDOR_CATEGORIES = [
  'Venue',
  'Catering',
  'Photography',
  'Videography',
  'Live band',
  'DJ / entertainment',
  'Florist / décor',
  'Cake',
  'Invitations & stationery',
  'Transport / chauffeur',
  'Security',
  'Marquee & furniture hire',
  'Lighting & AV',
  'Favours & gifts',
  'Kippot / yarmulkes',
  'Tallit',
  'Sofer / religious items',
  'Hair & makeup',
  'Suit / outfit hire',
  "Kids' entertainer",
  'Photobooth',
  'Valet parking',
  'Insurance',
  'Officiant / rabbi honorarium',
  'Sweet table / candy cart',
  'Balloon / prop styling',
  'Other',
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
