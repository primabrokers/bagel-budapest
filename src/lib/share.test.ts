import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, personaliseMessage, toWhatsAppDigits } from './share';

describe('toWhatsAppDigits', () => {
  it('swaps a UK leading 0 for the 44 country code', () => {
    expect(toWhatsAppDigits('07700 900123')).toBe('447700900123');
  });

  it('strips punctuation from an already-international +44 number', () => {
    expect(toWhatsAppDigits('+44 7700 900123')).toBe('447700900123');
  });

  it('passes through a bare international number with no leading 0 unmodified', () => {
    expect(toWhatsAppDigits('353871234567')).toBe('353871234567');
  });

  it('returns null for a blank or digit-free string', () => {
    expect(toWhatsAppDigits('')).toBeNull();
    expect(toWhatsAppDigits('   ')).toBeNull();
    expect(toWhatsAppDigits('n/a')).toBeNull();
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the message URL-encoded', () => {
    const link = buildWhatsAppLink('07700 900123', 'Hi there!');
    expect(link).toBe('https://wa.me/447700900123?text=Hi%20there!');
  });

  it('returns null when there is no phone number', () => {
    expect(buildWhatsAppLink(null, 'Hi there!')).toBeNull();
    expect(buildWhatsAppLink(undefined, 'Hi there!')).toBeNull();
    expect(buildWhatsAppLink('', 'Hi there!')).toBeNull();
  });

  it('returns null when the phone number has no usable digits', () => {
    expect(buildWhatsAppLink('n/a', 'Hi there!')).toBeNull();
  });
});

describe('personaliseMessage', () => {
  it('substitutes every matching placeholder', () => {
    expect(personaliseMessage('Hi {household}, link: {link}', { household: 'The Cohens', link: 'https://x' })).toBe(
      'Hi The Cohens, link: https://x',
    );
  });

  it('leaves an unmatched placeholder exactly as typed', () => {
    expect(personaliseMessage('Hi {oops}', {})).toBe('Hi {oops}');
  });

  it('substitutes the same placeholder wherever it repeats', () => {
    expect(personaliseMessage('{name} and {name} again', { name: 'Jo' })).toBe('Jo and Jo again');
  });

  it('is a no-op on a template with no placeholders', () => {
    expect(personaliseMessage('Plain text', { unused: 'x' })).toBe('Plain text');
  });
});
