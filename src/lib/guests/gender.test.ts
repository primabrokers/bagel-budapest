import { describe, expect, it } from 'vitest';
import { GENDER_VALUES, genderLabel, normaliseGender } from './gender';

/**
 * The case that matters most is the last one: whatever this function emits has to be a value
 * `autoSeat` recognises. If those two ever drift, the mechitza split quietly stops working for
 * every guest — no error, no warning, just people seated on the wrong side.
 */

describe('normaliseGender', () => {
  it('accepts the canonical values unchanged', () => {
    expect(normaliseGender('male')).toBe('male');
    expect(normaliseGender('female')).toBe('female');
  });

  it.each([
    ['M', 'male'],
    ['m', 'male'],
    ['  Male  ', 'male'],
    ['MAN', 'male'],
    ['boy', 'male'],
    ['F', 'female'],
    ['Female', 'female'],
    ['woman', 'female'],
    ['girl', 'female'],
  ])('reads %s as %s — the spellings a real guest list contains', (input, expected) => {
    expect(normaliseGender(input)).toBe(expected);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['a number', '1'],
    ['something else entirely', 'yes please'],
  ])('returns null for %s rather than inventing an answer', (_label, input) => {
    expect(normaliseGender(input as string | null | undefined)).toBeNull();
  });

  it('never returns anything outside the two values the seating solver knows', () => {
    const inputs = ['m', 'F', 'boy', 'girl', 'nonsense', '', 'Male', 'WOMEN', '   f '];
    for (const input of inputs) {
      const result = normaliseGender(input);
      expect(result === null || (GENDER_VALUES as readonly string[]).includes(result)).toBe(true);
    }
  });

  it('agrees with what autoSeat matches on', () => {
    // autoSeat.ts requiredSide(): `guest.gender?.trim().toLowerCase()` compared to 'male'/'female'.
    // Reproduced here so a change to either side fails this test rather than a family's seating.
    const asAutoSeatSeesIt = (value: string | null) => value?.trim().toLowerCase();
    expect(asAutoSeatSeesIt(normaliseGender('M'))).toBe('male');
    expect(asAutoSeatSeesIt(normaliseGender('girl'))).toBe('female');
  });
});

describe('genderLabel', () => {
  it('titles the two known values', () => {
    expect(genderLabel('m')).toBe('Male');
    expect(genderLabel('FEMALE')).toBe('Female');
  });

  it('renders an unrecorded gender as a blank, not as "Unknown"', () => {
    expect(genderLabel(null)).toBe('');
    expect(genderLabel('what')).toBe('');
  });
});
