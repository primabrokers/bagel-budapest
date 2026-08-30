/**
 * The one place that decides what a guest's gender field may hold.
 *
 * It exists because the field used to be a free-text box while `lib/seating/autoSeat.ts` matched
 * it against exactly `'male'` and `'female'` after trimming and lowercasing. Anyone typing "M", and
 * every spreadsheet column of M/F, produced a value the mechitza split silently ignored — the guest
 * was seated with no side constraint and nothing on screen said why. Normalising here, and offering
 * a select rather than a text box, makes the solver's assumption true by construction instead of by
 * hope.
 *
 * `null` is a real answer, not a failure: it means nobody has recorded this person's gender yet, and
 * `autoSeat` deliberately leaves such a guest unconstrained rather than guessing.
 */

export const GENDER_VALUES = ['male', 'female'] as const;

export type Gender = (typeof GENDER_VALUES)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
};

/**
 * Every spelling a real guest list actually contains, mapped to the two the solver understands.
 *
 * The list is deliberately generous on the way IN — a family importing a spreadsheet built by a
 * caterer, a shul secretary or a previous simcha should not lose the column because someone wrote
 * "boy" — while what comes out is only ever `'male'`, `'female'` or `null`.
 */
const ALIASES: Record<string, Gender> = {
  m: 'male',
  male: 'male',
  man: 'male',
  men: 'male',
  boy: 'male',
  b: 'male',
  f: 'female',
  female: 'female',
  woman: 'female',
  women: 'female',
  girl: 'female',
  g: 'female',
};

export function normaliseGender(raw: string | null | undefined): Gender | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/** For display. An unrecorded gender reads as a blank, never as "Unknown" — the guest list is full
 *  of people whose details are simply still being collected. */
export function genderLabel(raw: string | null | undefined): string {
  const value = normaliseGender(raw);
  return value ? GENDER_LABELS[value] : '';
}
