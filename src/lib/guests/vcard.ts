/**
 * A small vCard reader, so a family can get people out of their phone and into the guest list
 * without retyping them.
 *
 * Hand-rolled rather than a dependency, matching how `ImportWizard` already handles CSV and the
 * project's standing rule to keep the dependency list small. The job is narrow: names and contact
 * details out of a file the Contacts app produced. It is not a general vCard implementation and
 * does not pretend to be — it ignores photos, anniversaries, custom Apple properties and anything
 * else it does not need.
 *
 * The formats that actually turn up:
 *   - iOS Contacts → Lists → long-press All Contacts → Export → vCard 3.0, one file, many cards
 *   - iOS Share Contact → a single 3.0 card
 *   - Android / Google Contacts → 3.0, occasionally 4.0
 *   - Older Windows/Outlook exports → 2.1 with QUOTED-PRINTABLE, which is why that is decoded
 */

export interface ParsedContact {
  firstName: string;
  lastName: string;
  /** The card's display name, kept when N is missing or unhelpful. */
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface VCardParseResult {
  contacts: ParsedContact[];
  /** Plain-English notes for the person importing — never thrown, always shown. */
  notes: string[];
}

/** At most one phone book's worth. A file far larger than this is not a guest list. */
const MAX_CONTACTS = 500;

/**
 * Rejoins folded lines. vCard wraps long values by starting the continuation with a space or tab,
 * so an address or a long name arrives split across lines and must be put back together before
 * anything is read — otherwise half a postcode is silently dropped.
 */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** `TEL;TYPE=CELL;VALUE=TEXT:0790...` → name `TEL`, params `['TYPE=CELL','VALUE=TEXT']`, value the
 *  rest. Splitting on the FIRST colon matters: values contain colons. */
function splitLine(line: string): { name: string; params: string[]; value: string } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  return { name: parts[0].toUpperCase().replace(/^ITEM\d+\./i, ''), params: parts.slice(1), value };
}

/** vCard 2.1 encodes non-ASCII as QUOTED-PRINTABLE. Without this, an accented or Hebrew name
 *  arrives as mojibake rather than as itself. */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '=' && i + 2 < value.length) {
      const hex = value.slice(i + 1, i + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(value.charCodeAt(i));
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

/**
 * The two decoding steps are deliberately separate, and the order matters.
 *
 * Quoted-printable operates on the WHOLE property value, because a single character can be several
 * `=XX` bytes and they must be decoded together. Backslash unescaping operates on each FIELD, after
 * the value has been split on its separators — `splitStructured` needs the escapes still intact to
 * tell a real separator from a literal semicolon.
 *
 * Running the quoted-printable pass twice, which is what happens if one function does both and is
 * then applied per field, turns `Zo=C3=AB` into `Zo` plus a replacement character: the second pass
 * sees the already-decoded `ë` as a lone 0xEB byte, which is not valid UTF-8 on its own.
 */
function decodeQP(value: string, params: string[]): string {
  return params.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p)) ? decodeQuotedPrintable(value) : value;
}

/** Escapes defined by the spec. `\n` is a real newline in an address; the rest are literals. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Splits a structured value (`N`, `ADR`) on unescaped semicolons. */
function splitStructured(value: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      current += value[i] + value[i + 1];
      i++;
      continue;
    }
    if (value[i] === ';') {
      out.push(current);
      current = '';
      continue;
    }
    current += value[i];
  }
  out.push(current);
  return out;
}

/** Names split from a display name when the card has no structured N. "Sara Cohen" → Sara / Cohen;
 *  "Rabbi Yosef Ben David" keeps everything after the first word as the surname rather than
 *  guessing which of three words is the family name. */
function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function parseVCards(text: string): VCardParseResult {
  const notes: string[] = [];
  if (typeof text !== 'string' || !/BEGIN:VCARD/i.test(text)) {
    return { contacts: [], notes: ['That file does not look like a contacts file (.vcf).'] };
  }

  const contacts: ParsedContact[] = [];
  let card: Record<string, string> | null = null;
  let skippedNameless = 0;

  const finish = () => {
    if (!card) return;
    const fullName = card.FN ?? '';
    let firstName = card.N_FIRST ?? '';
    let lastName = card.N_LAST ?? '';
    if (!firstName && !lastName && fullName) {
      ({ firstName, lastName } = splitFullName(fullName));
    }
    // A card with no name at all is a company entry or a stray — there is nothing to add to a
    // guest list, and a blank row would only have to be deleted by hand.
    if (!firstName && !lastName && !fullName) {
      skippedNameless++;
      card = null;
      return;
    }
    contacts.push({
      firstName,
      lastName,
      fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
      phone: card.TEL || undefined,
      email: card.EMAIL || undefined,
      address: card.ADR || undefined,
    });
    card = null;
  };

  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      card = {};
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      finish();
      if (contacts.length >= MAX_CONTACTS) {
        notes.push(`That file holds more than ${MAX_CONTACTS} contacts — only the first ${MAX_CONTACTS} were read.`);
        break;
      }
      continue;
    }
    if (!card) continue;

    const parsed = splitLine(trimmed);
    if (!parsed) continue;
    // Quoted-printable is undone here, on the whole value. Backslash escapes are left in place for
    // now: the structured properties below split on separators and need to tell them apart from
    // escaped literals first.
    const decoded = decodeQP(parsed.value, parsed.params);
    const value = unescapeText(decoded);
    if (!decoded.trim()) continue;

    switch (parsed.name) {
      case 'FN':
        card.FN ??= value;
        break;
      case 'N': {
        // Family;Given;Additional;Prefix;Suffix
        const [family, given] = splitStructured(decoded).map(unescapeText);
        if (given) card.N_FIRST ??= given;
        if (family) card.N_LAST ??= family;
        break;
      }
      // First one wins throughout: a card lists mobile, home and work, and the first is the one
      // the phone itself shows at the top.
      case 'TEL':
        card.TEL ??= value;
        break;
      case 'EMAIL':
        card.EMAIL ??= value;
        break;
      case 'ADR': {
        // PO;Extended;Street;Locality;Region;Postcode;Country — the empty leading fields are
        // normal and would otherwise render as stray commas.
        const joined = splitStructured(decoded)
          .map(unescapeText)
          .filter(Boolean)
          .join(', ');
        if (joined) card.ADR ??= joined;
        break;
      }
      default:
        break;
    }
  }

  // A file whose last card has no END:VCARD still has a usable contact in hand.
  finish();

  if (skippedNameless > 0) {
    notes.push(`${skippedNameless} ${skippedNameless === 1 ? 'entry had' : 'entries had'} no name and ${skippedNameless === 1 ? 'was' : 'were'} skipped.`);
  }
  if (contacts.length === 0 && notes.length === 0) {
    notes.push('No contacts were found in that file.');
  }

  return { contacts, notes };
}
