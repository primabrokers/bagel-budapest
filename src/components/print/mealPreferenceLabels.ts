import type { MealPreference } from '../../data/guests/types';

/**
 * Display labels for `bm_guests.meal_preference` — shared by the print routes that show a
 * per-guest or aggregate meal-preference breakdown (`CatererPrintPage`,
 * `CateringSummaryPrintPage`). Mirrors the mapping `CateringSummaryCard` keeps privately for the
 * on-screen widget; kept here as the one shared home for this print-only duplication rather than
 * letting it drift between the two print pages that need it.
 */
export const MEAL_PREFERENCE_LABELS: Record<MealPreference, string> = {
  standard: 'Standard',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten free',
  other: 'Other',
};
