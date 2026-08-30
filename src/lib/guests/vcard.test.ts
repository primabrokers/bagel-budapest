import { describe, expect, it } from 'vitest';
import { parseVCards } from './vcard';

/**
 * The fixtures below are shaped like what the Contacts apps actually emit, because that is the only
 * thing this parser has to cope with. The awkward cases — folded lines, a missing N, several cards
 * in one file — are exactly where a naive line-splitter loses half a family's details silently.
 */

/** iOS "Export" output: vCard 3.0, one file, several cards, ITEM-prefixed properties. */
const APPLE_EXPORT = `BEGIN:VCARD
VERSION:3.0
N:Cohen;Sara;;;
FN:Sara Cohen
item1.TEL;type=pref:+44 20 7946 0958
item1.X-ABLabel:mobile
EMAIL;type=INTERNET;type=HOME;type=pref:sara@example.com
item2.ADR;type=HOME;type=pref:;;12 High Street;London;;NW4 1AB;United Kingdom
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Cohen;David;;;
FN:David Cohen
TEL;type=CELL;type=VOICE;type=pref:07700 900123
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Levy;Rivka;;;
FN:Rivka Levy
END:VCARD
`;

describe('parseVCards — a real Apple export', () => {
  it('reads every card in the file', () => {
    const { contacts } = parseVCards(APPLE_EXPORT);
    expect(contacts).toHaveLength(3);
    expect(contacts.map((c) => c.fullName)).toEqual(['Sara Cohen', 'David Cohen', 'Rivka Levy']);
  });

  it('splits N into given and family the right way round', () => {
    // N is Family;Given — getting this backwards would surname every guest with their first name.
    const [sara] = parseVCards(APPLE_EXPORT).contacts;
    expect(sara.firstName).toBe('Sara');
    expect(sara.lastName).toBe('Cohen');
  });

  it('takes the phone and email through ITEM-prefixed and parameterised properties', () => {
    const [sara] = parseVCards(APPLE_EXPORT).contacts;
    expect(sara.phone).toBe('+44 20 7946 0958');
    expect(sara.email).toBe('sara@example.com');
  });

  it('joins a structured address without the empty fields showing as stray commas', () => {
    const [sara] = parseVCards(APPLE_EXPORT).contacts;
    expect(sara.address).toBe('12 High Street, London, NW4 1AB, United Kingdom');
    expect(sara.address).not.toMatch(/^,|,,|, ,/);
  });

  it('leaves absent details undefined rather than empty strings', () => {
    const rivka = parseVCards(APPLE_EXPORT).contacts[2];
    expect(rivka.phone).toBeUndefined();
    expect(rivka.email).toBeUndefined();
    expect(rivka.address).toBeUndefined();
  });
});

describe('parseVCards — the awkward shapes', () => {
  it('rejoins a folded line instead of losing half of it', () => {
    // The continuation starts with a space. Split naively, this postcode disappears.
    const folded = `BEGIN:VCARD
VERSION:3.0
FN:Yaakov Rosenberg
ADR;type=HOME:;;44 Elstree Road;Bushey;Hertford
 shire;WD23 4EE;United Kingdom
END:VCARD`;
    const [contact] = parseVCards(folded).contacts;
    expect(contact.address).toContain('Hertfordshire');
    expect(contact.address).toContain('WD23 4EE');
  });

  it('falls back to FN when the card has no structured name', () => {
    const { contacts } = parseVCards('BEGIN:VCARD\nVERSION:3.0\nFN:Miriam Green\nEND:VCARD');
    expect(contacts[0]).toMatchObject({ firstName: 'Miriam', lastName: 'Green' });
  });

  it('keeps a multi-word surname whole rather than guessing which word it is', () => {
    const { contacts } = parseVCards('BEGIN:VCARD\nFN:Yosef Ben David\nEND:VCARD');
    expect(contacts[0]).toMatchObject({ firstName: 'Yosef', lastName: 'Ben David' });
  });

  it('handles a single name with no surname', () => {
    const { contacts } = parseVCards('BEGIN:VCARD\nFN:Bubby\nEND:VCARD');
    expect(contacts[0]).toMatchObject({ firstName: 'Bubby', lastName: '' });
  });

  it('decodes quoted-printable, so an accented name is not mojibake', () => {
    const qp = `BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Sch=C3=B6n;Zo=C3=AB;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Zo=C3=AB Sch=C3=B6n
END:VCARD`;
    const [contact] = parseVCards(qp).contacts;
    expect(contact.firstName).toBe('Zoë');
    expect(contact.lastName).toBe('Schön');
  });

  it('unescapes a comma in a name instead of showing the backslash', () => {
    const { contacts } = parseVCards('BEGIN:VCARD\nFN:Cohen\\, Sara\nEND:VCARD');
    expect(contacts[0].fullName).toBe('Cohen, Sara');
  });

  it('handles CRLF line endings, which is what a Windows export uses', () => {
    const crlf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ruth Stern\r\nEND:VCARD\r\n';
    expect(parseVCards(crlf).contacts).toHaveLength(1);
  });

  it('still returns the last card when the file is truncated mid-way', () => {
    const truncated = 'BEGIN:VCARD\nFN:Chana Weiss\nTEL:07700 900456';
    const [contact] = parseVCards(truncated).contacts;
    expect(contact.fullName).toBe('Chana Weiss');
    expect(contact.phone).toBe('07700 900456');
  });

  it('skips a nameless entry and says how many it skipped', () => {
    const withCompany = `BEGIN:VCARD
VERSION:3.0
ORG:Some Caterer Ltd
TEL:020 1234 5678
END:VCARD
BEGIN:VCARD
FN:Real Person
END:VCARD`;
    const { contacts, notes } = parseVCards(withCompany);
    expect(contacts.map((c) => c.fullName)).toEqual(['Real Person']);
    expect(notes.join(' ')).toMatch(/1 entry had no name/i);
  });
});

describe('parseVCards — junk in', () => {
  it('says so, rather than throwing, when the file is not a vCard', () => {
    const { contacts, notes } = parseVCards('first_name,last_name\nSara,Cohen');
    expect(contacts).toEqual([]);
    expect(notes.join(' ')).toMatch(/does not look like a contacts file/i);
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   \n\n  '],
  ])('handles %s', (_label, input) => {
    expect(parseVCards(input).contacts).toEqual([]);
  });

  it('does not throw on a non-string', () => {
    expect(() => parseVCards(null as unknown as string)).not.toThrow();
    expect(parseVCards(undefined as unknown as string).contacts).toEqual([]);
  });

  it('caps an enormous file and says it did', () => {
    const many = Array.from({ length: 600 }, (_, i) => `BEGIN:VCARD\nFN:Guest ${i}\nEND:VCARD`).join('\n');
    const { contacts, notes } = parseVCards(many);
    expect(contacts.length).toBeLessThanOrEqual(500);
    expect(notes.join(' ')).toMatch(/more than 500/i);
  });
});
