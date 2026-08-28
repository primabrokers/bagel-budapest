import type { GuestWithDetails, HouseholdWithGuests, MealPreference } from '../../data/guests/types';

/**
 * The catering headcount for one function ("Friday night dinner", "Sunday party" …), derived
 * entirely from the guest book `useGuestBook()` already has loaded — no separate query.
 *
 * COUNTING RULE (mirrors the convention `lib/guests/rsvpStats.ts` set for the RSVP dashboard
 * widget — read there for the general pattern; this is menu's own derivation, not an import from
 * it): a guest counts towards this function's catering **only** when their own
 * `functionInvites` row for `functionId` has BOTH `invited: true` AND `rsvp: 'attending'`.
 * "Invited" alone is not enough — a caterer needs to feed people who are actually coming, not
 * everyone who was asked — and "attending" alone is not a real state without `invited` (the
 * column exists so an uninvited guest's row, if one is ever written, can never masquerade as a
 * confirmed cover). This is a deliberately different, stricter bar than `rsvpStats`, which counts
 * every RSVP bucket (including 'awaiting'/'declined') for its funnel view; a catering summary
 * only ever cares about the one bucket someone has to cook for.
 *
 * `meal_preference`, `child_meal`, `high_chair` and `allergies` all live on `GuestRow` itself —
 * they are properties of the guest, not of any one function — so "of the guests attending
 * function X, how many are vegetarian / need a high chair / have listed an allergy" is exactly
 * what every field below reports.
 */

export interface AllergyEntry {
  guestId: string;
  name: string;
  allergies: string;
}

export interface CateringSummary {
  functionId: string;
  /** Every guest counted in this summary — `adults + children`. */
  attending: number;
  /** Attending guests with `guest_type === 'adult'`. */
  adults: number;
  /** Attending guests with `guest_type === 'child'`. */
  children: number;
  /**
   * Attending guests with `child_meal === true` — the family's own flag for "needs a catered
   * children's meal", which is not simply a restatement of `children` above: an older child close
   * to bar/bat mitzvah age might eat the adult menu (guest_type 'child', child_meal false), and
   * this flag is what the caterer actually needs, not the raw age classification.
   */
  childMealCount: number;
  /** Attending guests with `high_chair === true`. */
  highChairCount: number;
  /**
   * Attending guests bucketed by `meal_preference`. A guest with no preference recorded
   * (`meal_preference: null`) is counted under `'standard'` — the absence of a note is read as
   * "no special requirement", which is the only reading a caterer can act on; it is never dropped
   * from the total silently.
   */
  byMealPreference: Record<MealPreference, number>;
  /**
   * Attending guests with a non-empty `allergies` field, name plus the raw text — the sheet a
   * family hands to the caterer. Sorted by name so it reads as a roster, not insertion order.
   */
  allergyRoster: AllergyEntry[];
}

const MEAL_PREFERENCES: MealPreference[] = ['standard', 'vegetarian', 'vegan', 'gluten_free', 'other'];

function emptyMealPreferenceBuckets(): Record<MealPreference, number> {
  return { standard: 0, vegetarian: 0, vegan: 0, gluten_free: 0, other: 0 };
}

function guestName(guest: GuestWithDetails): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ').trim();
}

/** True when `guest` is attending `functionId` per the rule documented above. */
function isAttending(guest: GuestWithDetails, functionId: string): boolean {
  return guest.functionInvites.some(
    (invite) => invite.function_id === functionId && invite.invited && invite.rsvp === 'attending',
  );
}

/** Every guest across every household attending the given function — exported chiefly so other
 *  menu-adjacent views (e.g. a future "who's coming" list) can share the exact same filter rather
 *  than re-deriving it slightly differently. */
export function attendingGuestsForFunction(
  households: HouseholdWithGuests[],
  functionId: string,
): GuestWithDetails[] {
  const guests: GuestWithDetails[] = [];
  for (const household of households) {
    for (const guest of household.guests) {
      if (isAttending(guest, functionId)) guests.push(guest);
    }
  }
  return guests;
}

/** The catering summary for one function — see the module comment for the exact counting rule. */
export function cateringSummary(households: HouseholdWithGuests[], functionId: string): CateringSummary {
  const attendingGuests = attendingGuestsForFunction(households, functionId);

  let adults = 0;
  let children = 0;
  let childMealCount = 0;
  let highChairCount = 0;
  const byMealPreference = emptyMealPreferenceBuckets();
  const allergyRoster: AllergyEntry[] = [];

  for (const guest of attendingGuests) {
    if (guest.guest_type === 'adult') adults += 1;
    else children += 1;

    if (guest.child_meal) childMealCount += 1;
    if (guest.high_chair) highChairCount += 1;

    const preference = guest.meal_preference ?? 'standard';
    byMealPreference[preference] += 1;

    const allergies = guest.allergies?.trim();
    if (allergies) {
      allergyRoster.push({ guestId: guest.id, name: guestName(guest), allergies });
    }
  }

  allergyRoster.sort((a, b) => a.name.localeCompare(b.name));

  return {
    functionId,
    attending: adults + children,
    adults,
    children,
    childMealCount,
    highChairCount,
    byMealPreference,
    allergyRoster,
  };
}

/** The fixed display order `CateringSummaryCard` renders `byMealPreference` in. */
export const MEAL_PREFERENCE_ORDER = MEAL_PREFERENCES;
