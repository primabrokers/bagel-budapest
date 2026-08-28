import { describe, expect, it } from 'vitest';
import { findDuplicate, findGuestDuplicateInHousehold, normaliseForDedupe } from './importDedupe';
import type { ExistingHousehold, ExistingGuestName } from './importDedupe';

describe('normaliseForDedupe', () => {
  it('casefolds and strips punctuation/whitespace for text', () => {
    expect(normaliseForDedupe('The Cohen Family')).toBe('thecohenfamily');
    expect(normaliseForDedupe("O'Brien-Katz")).toBe('obrienkatz');
  });

  it('strips everything but digits for a phone number', () => {
    expect(normaliseForDedupe('+44 7700 900123', 'phone')).toBe('447700900123');
    expect(normaliseForDedupe('(07700) 900-123', 'phone')).toBe('07700900123');
  });
});

describe('findDuplicate', () => {
  const existing: ExistingHousehold[] = [
    { id: 'h1', name: 'The Cohen Family', email: 'sarah@example.com', phone: '07700 900123' },
    { id: 'h2', name: 'Katz', email: null, phone: null },
  ];

  it('reports an exact match on normalised email', () => {
    const result = findDuplicate({ name: 'Someone Else', email: 'Sarah@Example.com' }, existing);
    expect(result).toEqual({ kind: 'exact', match: existing[0] });
  });

  it('reports an exact match on normalised phone', () => {
    const result = findDuplicate({ name: 'Someone Else', phone: '(07700) 900-123' }, existing);
    expect(result).toEqual({ kind: 'exact', match: existing[0] });
  });

  it('reports a possible match on normalised household name when no contact details match', () => {
    const result = findDuplicate({ name: 'katz' }, existing);
    expect(result).toEqual({ kind: 'possible', match: existing[1] });
  });

  it('prefers an exact contact match over a name-only possible match', () => {
    const result = findDuplicate({ name: 'The Cohen Family', email: 'sarah@example.com' }, existing);
    expect(result?.kind).toBe('exact');
  });

  it('returns null when nothing matches', () => {
    expect(findDuplicate({ name: 'Nobody Here', email: 'nobody@example.com' }, existing)).toBeNull();
  });

  it('returns null for a blank candidate', () => {
    expect(findDuplicate({ name: '' }, existing)).toBeNull();
  });
});

describe('findGuestDuplicateInHousehold', () => {
  const guests: ExistingGuestName[] = [{ id: 'g1', first_name: 'Sarah', last_name: 'Cohen' }];

  it('reports a possible match on normalised full name', () => {
    const result = findGuestDuplicateInHousehold({ first_name: 'sarah', last_name: 'COHEN' }, guests);
    expect(result).toEqual({ kind: 'possible', match: guests[0] });
  });

  it('never reports exact — a same-named guest might genuinely be a second real person', () => {
    const result = findGuestDuplicateInHousehold({ first_name: 'Sarah', last_name: 'Cohen' }, guests);
    expect(result?.kind).toBe('possible');
  });

  it('returns null when the name does not match', () => {
    expect(findGuestDuplicateInHousehold({ first_name: 'David', last_name: 'Katz' }, guests)).toBeNull();
  });

  it('matches on first name alone when there is no last name', () => {
    const singleName: ExistingGuestName[] = [{ id: 'g2', first_name: 'Rabbi Weiss', last_name: null }];
    expect(findGuestDuplicateInHousehold({ first_name: 'rabbi weiss' }, singleName)).toEqual({
      kind: 'possible',
      match: singleName[0],
    });
  });
});
