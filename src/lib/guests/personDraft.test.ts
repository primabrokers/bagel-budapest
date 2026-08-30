import { describe, expect, it } from 'vitest';
import {
  blankPerson,
  derivedHouseholdName,
  filledPeople,
  inheritedSurname,
  initialPeople,
  toGuestInputs,
  updatePerson,
  type PersonDraft,
} from './personDraft';

function person(over: Partial<PersonDraft>): PersonDraft {
  return { ...blankPerson(), ...over };
}

describe('filledPeople', () => {
  it('keeps only the rows someone actually typed a name into', () => {
    const rows = [person({ firstName: 'Sara' }), blankPerson(), person({ firstName: 'David' })];
    expect(filledPeople(rows).map((p) => p.firstName)).toEqual(['Sara', 'David']);
  });

  it('ignores a row with only a surname — a trailing blank that inherited one', () => {
    // The surname carry-down fills the next blank row's surname. That row is still scaffolding.
    expect(filledPeople([person({ lastName: 'Cohen' })])).toEqual([]);
  });

  it('treats a whitespace-only name as blank', () => {
    expect(filledPeople([person({ firstName: '   ' })])).toEqual([]);
  });
});

describe('inheritedSurname', () => {
  it('takes the last surname actually typed', () => {
    expect(inheritedSurname([person({ lastName: 'Cohen' }), person({ lastName: 'Levy' })])).toBe('Levy');
  });

  it('skips back past rows that have no surname yet', () => {
    expect(inheritedSurname([person({ lastName: 'Cohen' }), blankPerson()])).toBe('Cohen');
  });

  it('is empty when nobody has one', () => {
    expect(inheritedSurname(initialPeople())).toBe('');
  });
});

describe('derivedHouseholdName', () => {
  it('names the household after the first real person with a surname', () => {
    const rows = [person({ firstName: 'Sara', lastName: 'Cohen' }), person({ firstName: 'David', lastName: 'Cohen' })];
    expect(derivedHouseholdName(rows)).toBe('Cohen');
  });

  it('ignores a blank row that merely inherited a surname', () => {
    expect(derivedHouseholdName([person({ lastName: 'Cohen' })])).toBe('');
  });

  it('is empty when there is nothing to derive from', () => {
    expect(derivedHouseholdName([person({ firstName: 'Bubby' })])).toBe('');
  });
});

describe('toGuestInputs', () => {
  it('drops the blank scaffolding rows', () => {
    const rows = [person({ firstName: 'Sara', lastName: 'Cohen' }), blankPerson(), blankPerson()];
    expect(toGuestInputs(rows)).toHaveLength(1);
  });

  it('trims, and writes an absent surname as null rather than an empty string', () => {
    const [row] = toGuestInputs([person({ firstName: '  Sara  ', lastName: '   ' })]);
    expect(row.first_name).toBe('Sara');
    expect(row.last_name).toBeNull();
  });

  it('writes an unset gender as null, not an empty string the database would reject', () => {
    const [row] = toGuestInputs([person({ firstName: 'Sara', gender: '' })]);
    expect(row.gender).toBeNull();
  });

  it('carries a set gender through as one of the two values the seating solver knows', () => {
    const [row] = toGuestInputs([person({ firstName: 'Sara', gender: 'female' })]);
    expect(row.gender).toBe('female');
  });

  it('numbers people in the order they appear, ignoring the blanks between them', () => {
    const rows = [person({ firstName: 'A' }), blankPerson(), person({ firstName: 'B' })];
    expect(toGuestInputs(rows).map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it('continues from an offset, so appending does not reshuffle who is already on the card', () => {
    const rows = [person({ firstName: 'Cousin' })];
    expect(toGuestInputs(rows, 4)[0].sort_order).toBe(4);
  });

  it('keeps adult and child as given', () => {
    const rows = [person({ firstName: 'Ari', guestType: 'child' })];
    expect(toGuestInputs(rows)[0].guest_type).toBe('child');
  });
});

describe('updatePerson', () => {
  const rows = () => [
    person({ key: 'a', firstName: 'Yaakov' }),
    person({ key: 'b', firstName: 'Chana' }),
    person({ key: 'c' }),
  ];

  it('carries a surname down to the blank rows below it', () => {
    // The gap this closes: the carry-down used to reach only rows added afterwards, so the second
    // person in every household still had their surname typed by hand.
    const next = updatePerson(rows(), 'a', { lastName: 'Rosenberg' });
    expect(next.map((p) => p.lastName)).toEqual(['Rosenberg', 'Rosenberg', 'Rosenberg']);
  });

  it('never overwrites a surname somebody already typed', () => {
    const withOwn = [person({ key: 'a', firstName: 'Sara' }), person({ key: 'b', firstName: 'Dov', lastName: 'Levy' })];
    const next = updatePerson(withOwn, 'a', { lastName: 'Cohen' });
    expect(next[1].lastName).toBe('Levy');
  });

  it('does not reach backwards to the rows above', () => {
    const next = updatePerson(rows(), 'b', { lastName: 'Rosenberg' });
    expect(next[0].lastName).toBe('');
  });

  it('clearing a surname does not blank out the rows below', () => {
    const filled = [person({ key: 'a', lastName: 'Cohen' }), person({ key: 'b', lastName: 'Cohen' })];
    expect(updatePerson(filled, 'a', { lastName: '' })[1].lastName).toBe('Cohen');
  });

  it('leaves other fields alone', () => {
    const next = updatePerson(rows(), 'a', { gender: 'male' });
    expect(next[0].gender).toBe('male');
    expect(next[1].gender).toBe('');
  });

  it('is a no-op for a key that is not there', () => {
    expect(updatePerson(rows(), 'nope', { lastName: 'X' })).toEqual(rows().map((p, i) => ({ ...p, key: ['a','b','c'][i] })));
  });
});
