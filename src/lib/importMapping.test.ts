import { describe, expect, it } from 'vitest';
import { defaultMapping, guessColumnMapping } from './importMapping';

describe('guessColumnMapping', () => {
  it('matches common synonyms case-insensitively', () => {
    const mapping = guessColumnMapping(['First Name', 'Surname', 'E-mail', 'Mobile']);
    expect(mapping).toEqual({
      'First Name': 'first_name',
      Surname: 'last_name',
      'E-mail': 'email',
      Mobile: 'phone',
    });
  });

  it('matches a household-grouping column', () => {
    const mapping = guessColumnMapping(['Family', 'Given Name']);
    expect(mapping.Family).toBe('household_name');
    expect(mapping['Given Name']).toBe('first_name');
  });

  it('matches a header identical to the field name itself', () => {
    expect(guessColumnMapping(['first_name'])).toEqual({ first_name: 'first_name' });
  });

  it('leaves an unrecognised column unmapped', () => {
    expect(guessColumnMapping(['Table number'])).toEqual({ 'Table number': null });
  });

  it('only maps the first of two columns claiming the same field', () => {
    const mapping = guessColumnMapping(['Email', 'E-mail']);
    expect(mapping.Email).toBe('email');
    expect(mapping['E-mail']).toBeNull();
  });

  it('is tolerant of extra whitespace and underscores in the header', () => {
    expect(guessColumnMapping(['  first_name  '])).toEqual({ '  first_name  ': 'first_name' });
    expect(guessColumnMapping(['Side_Of_Family'])).toEqual({ Side_Of_Family: 'side_of_family' });
  });
});

describe('defaultMapping', () => {
  it('defaults to group_by_column when a household column is present', () => {
    const mapping = defaultMapping(['Family', 'First Name', 'Last Name']);
    expect(mapping.mode).toBe('group_by_column');
    expect(mapping.householdColumn).toBe('Family');
  });

  it('defaults to one_per_row when no household column is present', () => {
    const mapping = defaultMapping(['First Name', 'Last Name', 'Email']);
    expect(mapping.mode).toBe('one_per_row');
    expect(mapping.householdColumn).toBeNull();
  });
});
