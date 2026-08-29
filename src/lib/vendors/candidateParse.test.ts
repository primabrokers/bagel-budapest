import { describe, expect, it } from 'vitest';
import { parseVendorCandidates, safeEmail, safeExternalUrl, safePhone } from './candidateParse';

/**
 * This data reaches the app from web pages a model read, so the tests are mostly about refusing
 * hostile input — above all a URL that is not really a URL, since a researched "website" becomes a
 * clickable link in front of a family.
 */

describe('safeExternalUrl', () => {
  it('accepts ordinary http and https addresses', () => {
    expect(safeExternalUrl('https://bloom.example/flowers')).toBe('https://bloom.example/flowers');
    expect(safeExternalUrl('http://bloom.example')).toBe('http://bloom.example/');
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['uppercase javascript', 'JavaScript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['file', 'file:///etc/passwd'],
    ['mailto', 'mailto:someone@example.com'],
    ['tel', 'tel:+441234567890'],
    ['not a url at all', 'bloom.example'],
    ['empty', ''],
  ])('rejects a %s URL', (_label, value) => {
    expect(safeExternalUrl(value)).toBeUndefined();
  });

  it('rejects credentials embedded in a URL, which are a phishing shape', () => {
    expect(safeExternalUrl('https://real-site.example@evil.example/')).toBeUndefined();
  });

  it('rejects a non-string and an over-long value', () => {
    expect(safeExternalUrl(null)).toBeUndefined();
    expect(safeExternalUrl(`https://e.example/${'a'.repeat(600)}`)).toBeUndefined();
  });
});

describe('safeEmail', () => {
  it('accepts an ordinary address', () => {
    expect(safeEmail('sara@bloom.example')).toBe('sara@bloom.example');
  });

  it.each([
    ['no at', 'sara.bloom.example'],
    ['no domain dot', 'sara@bloom'],
    ['spaces', 'sara @bloom.example'],
    ['a quote inside the address', 'sara"@bloom.example'],
    ['two addresses run together', 'sara@bloom.example evil@attacker.example'],
  ])('rejects %s', (_label, value) => {
    expect(safeEmail(value)).toBeUndefined();
  });

  it('recovers the address from a page that wrapped it in a link', () => {
    // Tags are stripped before validation, so a mailto link in the source still yields the
    // address — and it is still validated afterwards, which is what makes that safe.
    expect(safeEmail('<a>sara@bloom.example</a>')).toBe('sara@bloom.example');
  });
});

describe('safePhone', () => {
  it('accepts UK formats with spaces, dashes and a country code', () => {
    expect(safePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(safePhone('020-7946-0958')).toBe('020-7946-0958');
  });

  it('rejects letters, which mean it is not a number', () => {
    expect(safePhone('call us on 020 7946 0958')).toBeUndefined();
  });

  it('rejects punctuation with too few digits to be a real number', () => {
    expect(safePhone('---')).toBeUndefined();
    expect(safePhone('12345')).toBeUndefined();
  });
});

describe('parseVendorCandidates', () => {
  const good = {
    candidates: [
      {
        name: 'Bloom & Co',
        summary: 'Florist with kosher-event experience.',
        website: 'https://bloom.example',
        sourceUrl: 'https://directory.example/bloom',
        phone: '+44 20 7946 0958',
        email: 'sara@bloom.example',
        address: '12 High Street, London',
      },
    ],
  };

  it('accepts a well-formed result', () => {
    const { candidates, notes } = parseVendorCandidates(good);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('Bloom & Co');
    expect(candidates[0].website).toBe('https://bloom.example/');
    expect(notes).toEqual([]);
  });

  it('accepts a bare array as well as a wrapped object', () => {
    expect(parseVendorCandidates(good.candidates).candidates).toHaveLength(1);
  });

  it('strips markup from a name a page tried to inject', () => {
    const { candidates } = parseVendorCandidates({ candidates: [{ name: '<b>Bloom</b>', summary: 'x' }] });
    expect(candidates[0].name).toBe('Bloom');
  });

  it('drops a javascript: website but keeps the supplier and says so', () => {
    const { candidates, notes } = parseVendorCandidates({
      candidates: [{ name: 'Bloom', summary: 'x', website: 'javascript:alert(1)' }],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].website).toBeUndefined();
    expect(notes.join(' ')).toMatch(/dropped/i);
  });

  it('skips a candidate with no name rather than storing a blank row', () => {
    const { candidates } = parseVendorCandidates({ candidates: [{ summary: 'no name here' }, { name: 'Real', summary: 'x' }] });
    expect(candidates.map((c) => c.name)).toEqual(['Real']);
  });

  it('caps the list and says it did', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `V${i}`, summary: 'x' }));
    const { candidates, notes } = parseVendorCandidates({ candidates: many });
    expect(candidates).toHaveLength(8);
    expect(notes.join(' ')).toMatch(/first 8/i);
  });

  it('returns nothing usable, with a reason, for junk', () => {
    expect(parseVendorCandidates('nope').candidates).toEqual([]);
    expect(parseVendorCandidates(null).notes.length).toBeGreaterThan(0);
    expect(parseVendorCandidates({ candidates: [] }).notes.join(' ')).toMatch(/no usable/i);
  });

  it('leaves a bad phone or email out instead of storing something wrong', () => {
    const { candidates } = parseVendorCandidates({
      candidates: [{ name: 'Bloom', summary: 'x', phone: 'ring us!', email: 'not-an-email' }],
    });
    expect(candidates[0].phone).toBeUndefined();
    expect(candidates[0].email).toBeUndefined();
  });
});
