/**
 * Pure duplicate-detection for `ImportWizard`'s preview step (build plan §3.6). Only the
 * detection logic lives here — the wizard owns surfacing a per-row flag and letting the family
 * choose skip / merge / create-anyway.
 */

/**
 * Casefold and strip punctuation/whitespace for free-text comparison (names, household names);
 * for a phone number, keep only digits so "+44 7700 900123" and "07700 900 123" compare equal.
 * Deliberately does not attempt to reconcile a "+44" country code against a leading "0" — that is
 * a real limitation, not a bug, and a genuine collision there is still caught by the email match.
 */
export function normaliseForDedupe(value: string, kind: 'text' | 'phone' = 'text'): string {
  if (kind === 'phone') return value.replace(/\D+/g, '');
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export type DuplicateKind = 'exact' | 'possible';

export interface DuplicateMatch<T> {
  kind: DuplicateKind;
  match: T;
}

export interface DedupeCandidateHousehold {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface ExistingHousehold {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Exact match on normalised email or normalised phone; failing that, a possible match on
 * normalised household-name equality. Checked in that order — a shared contact detail is a
 * stronger signal than two households merely sharing a name — and returns `null` when nothing
 * lines up at all.
 */
export function findDuplicate(
  candidate: DedupeCandidateHousehold,
  existing: ExistingHousehold[],
): DuplicateMatch<ExistingHousehold> | null {
  const candidateEmail = candidate.email ? normaliseForDedupe(candidate.email) : '';
  if (candidateEmail) {
    const hit = existing.find((h) => h.email && normaliseForDedupe(h.email) === candidateEmail);
    if (hit) return { kind: 'exact', match: hit };
  }

  const candidatePhone = candidate.phone ? normaliseForDedupe(candidate.phone, 'phone') : '';
  if (candidatePhone) {
    const hit = existing.find((h) => h.phone && normaliseForDedupe(h.phone, 'phone') === candidatePhone);
    if (hit) return { kind: 'exact', match: hit };
  }

  const candidateName = normaliseForDedupe(candidate.name);
  if (candidateName) {
    const hit = existing.find((h) => normaliseForDedupe(h.name) === candidateName);
    if (hit) return { kind: 'possible', match: hit };
  }

  return null;
}

export interface ExistingGuestName {
  id: string;
  first_name: string;
  last_name: string | null;
}

/**
 * Within one household, a possible-only match on normalised full-name equality. This app's
 * `bm_guests` schema carries no email/phone of its own (only the household's), so a guest-level
 * duplicate can only ever be a name collision — and two same-named guests in one household really
 * might both be real people (a grandfather and grandson sharing a name), hence this never reports
 * `'exact'`.
 */
export function findGuestDuplicateInHousehold(
  candidate: { first_name: string; last_name?: string | null },
  existingGuests: ExistingGuestName[],
): DuplicateMatch<ExistingGuestName> | null {
  const candidateName = normaliseForDedupe([candidate.first_name, candidate.last_name].filter(Boolean).join(' '));
  if (!candidateName) return null;

  const hit = existingGuests.find(
    (g) => normaliseForDedupe([g.first_name, g.last_name].filter(Boolean).join(' ')) === candidateName,
  );
  return hit ? { kind: 'possible', match: hit } : null;
}
