/**
 * Row types for `bm_events` / `bm_event_members` / `bm_functions` — see migration 1
 * (`supabase/migrations/20260828030000_bm_core_event.sql`) for the applied schema these mirror
 * field-for-field. Hand-written, not generated — see CLAUDE.md's "no react-query, hand-written
 * row types" data-layer note.
 */

/**
 * The invitation designer (Stage 5) reads this more fully — a font pick, a background image,
 * block layout. This stage only needs the two swatches the Settings palette editor writes.
 */
export interface EventPalette {
  primaryHex?: string;
  accentHex?: string;
}

export interface EventRow {
  id: string;
  title: string;
  boy_name: string;
  boy_hebrew_name: string | null;
  parents_names: string | null;
  /** `date`-only column, e.g. "2026-10-24" — parse with `toLocalDateOnly` from lib/format.ts
   *  before building a real `Date`, never a bare `new Date(event_date)`. */
  event_date: string;
  hebrew_date_override: string | null;
  venue_name: string | null;
  venue_address: string | null;
  /** `time`-only columns, e.g. "18:30:00". */
  ceremony_time: string | null;
  reception_time: string | null;
  dinner_time: string | null;
  dress_code: string | null;
  theme: string | null;
  palette: EventPalette;
  monogram_path: string | null;
  logo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EventMemberRow {
  id: string;
  event_id: string;
  /** Null until this invite is claimed by a real sign-in. */
  user_id: string | null;
  /** Null once claimed and for the seeded owner row, which is never "invited" in the first
   *  place — see bm_ensure_event_provisioned(). */
  invited_email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export type FunctionKind =
  | 'friday_night'
  | 'shabbos_morning'
  | 'kiddush'
  | 'lunch'
  | 'shalosh_seudos'
  | 'motzei_shabbos'
  | 'party'
  | 'other';

export interface FunctionRow {
  id: string;
  event_id: string;
  name: string;
  kind: FunctionKind;
  /** `timestamptz` — a real moment, unlike `bm_events.event_date`. */
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  dress_code: string | null;
  hebrew_date_override: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
