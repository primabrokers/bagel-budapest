import type { GuestType } from '../../data/guests/types';
import type { Gender } from './gender';

/**
 * One unsaved person on a household card, and the rules for turning a screenful of them into rows.
 *
 * Kept out of the component that renders them so the awkward parts — which rows count, what a blank
 * row means, where the surname comes from — can be tested without a browser, and so the file that
 * renders them exports only a component.
 */

export interface PersonDraft {
  /** Stable across re-renders and reorders. Never sent to the database. */
  key: string;
  firstName: string;
  lastName: string;
  guestType: GuestType;
  gender: Gender | '';
}

/** What a saved person looks like on the way to `createGuests`. Structurally `NewGuestInput`, named
 *  separately so this module does not depend on the mutations layer. */
export interface PersonDraftInput {
  first_name: string;
  last_name: string | null;
  guest_type: GuestType;
  gender: Gender | null;
  sort_order: number;
}

let keySeq = 0;
export function nextPersonKey(): string {
  keySeq += 1;
  return `p${keySeq}`;
}

export function blankPerson(lastName = ''): PersonDraft {
  return { key: nextPersonKey(), firstName: '', lastName, guestType: 'adult', gender: '' };
}

/** Two rows to begin with: a household is rarely one person, and an empty row costs nothing. */
export function initialPeople(): PersonDraft[] {
  return [blankPerson(), blankPerson()];
}

/**
 * A row counts only once it has a first name.
 *
 * The trailing blank rows are scaffolding, not guests. Saving them would put nameless entries in the
 * guest list that someone then has to find and delete — and the seating warnings would count them
 * as real people needing seats.
 */
export function filledPeople(people: PersonDraft[]): PersonDraft[] {
  return people.filter((p) => p.firstName.trim().length > 0);
}

/**
 * The surname a newly added row should start with: the last one actually typed above it.
 *
 * A new row in the Cohen household is almost always another Cohen. It stays editable, so the
 * son-in-law with a different surname costs one correction rather than everyone else costing a
 * retype.
 */
export function inheritedSurname(people: PersonDraft[]): string {
  for (let i = people.length - 1; i >= 0; i--) {
    const surname = people[i].lastName.trim();
    if (surname) return surname;
  }
  return '';
}

/**
 * Applies one row's edit, and carries a surname DOWN to the rows below it that do not have one yet.
 *
 * Without this the carry-down only reached rows added afterwards: filling in "Rosenberg" on person 1
 * left the already-present person 2 blank, so the second name in every household still had to be
 * typed. Only blanks are filled — a row where someone has typed a different surname is never
 * overwritten, because the son-in-law with another name must not be renamed by the row above him.
 */
export function updatePerson(
  people: PersonDraft[],
  key: string,
  patch: Partial<PersonDraft>,
): PersonDraft[] {
  const index = people.findIndex((p) => p.key === key);
  if (index === -1) return people;

  const surname = typeof patch.lastName === 'string' ? patch.lastName.trim() : null;

  return people.map((person, i) => {
    if (person.key === key) return { ...person, ...patch };
    if (surname && i > index && !person.lastName.trim()) return { ...person, lastName: patch.lastName as string };
    return person;
  });
}

/** The household's name, when the family has not typed one: the first surname on the card. */
export function derivedHouseholdName(people: PersonDraft[]): string {
  return filledPeople(people).find((p) => p.lastName.trim())?.lastName.trim() ?? '';
}

export function toGuestInputs(people: PersonDraft[], startSortOrder = 0): PersonDraftInput[] {
  return filledPeople(people).map((person, index) => ({
    first_name: person.firstName.trim(),
    last_name: person.lastName.trim() || null,
    guest_type: person.guestType,
    gender: person.gender || null,
    sort_order: startSortOrder + index,
  }));
}
