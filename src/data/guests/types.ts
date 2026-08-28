/**
 * Row types for `bm_households` / `bm_guests` / `bm_tags` / `bm_household_tags` / `bm_guest_tags`
 * / `bm_guest_function_invites` — see migration 2 (`supabase/migrations/20260828030100_bm_guests.sql`)
 * for the applied schema these mirror field-for-field. Hand-written, not generated — see
 * CLAUDE.md's "no react-query, hand-written row types" data-layer note.
 */

export type SideOfFamily = 'father' | 'mother' | 'both' | 'friends' | 'community' | 'other';
export type GuestType = 'adult' | 'child';
export type MealPreference = 'standard' | 'vegetarian' | 'vegan' | 'gluten_free' | 'other';
export type RsvpStatus = 'awaiting' | 'attending' | 'declined' | 'unsure';

export interface HouseholdRow {
  id: string;
  event_id: string;
  name: string;
  main_contact_name: string | null;
  address_lines: string | null;
  postcode: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  category: string | null;
  side_of_family: SideOfFamily | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GuestRow {
  id: string;
  event_id: string;
  household_id: string;
  first_name: string;
  last_name: string | null;
  guest_type: GuestType;
  age: number | null;
  gender: string | null;
  dietary: string | null;
  allergies: string | null;
  meal_preference: MealPreference | null;
  child_meal: boolean;
  high_chair: boolean;
  baby_seat: boolean;
  accessibility: string | null;
  relationship: string | null;
  is_vip: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  event_id: string;
  name: string;
  colour: string | null;
  is_builtin: boolean;
  created_at: string;
}

export interface HouseholdTagRow {
  id: string;
  event_id: string;
  household_id: string;
  tag_id: string;
}

export interface GuestTagRow {
  id: string;
  event_id: string;
  guest_id: string;
  tag_id: string;
}

export interface GuestFunctionInviteRow {
  id: string;
  event_id: string;
  guest_id: string;
  function_id: string;
  invited: boolean;
  rsvp: RsvpStatus;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One guest carrying its own tag ids and function invites — the shape `useGuestBook()` nests
 *  under each household, embedded from `bm_guest_tags`/`bm_guest_function_invites` in one joined
 *  fetch rather than a separate query per guest. */
export interface GuestWithDetails extends GuestRow {
  tagIds: string[];
  functionInvites: GuestFunctionInviteRow[];
}

/** One household with its guests (each carrying its own tags/invites) and the household's own
 *  tag ids — the whole shape `useGuestBook()` returns, and everything the Guests screen and the
 *  RSVP dashboard widget read from. */
export interface HouseholdWithGuests extends HouseholdRow {
  tagIds: string[];
  guests: GuestWithDetails[];
}
