/**
 * Validates researched vendor candidates before any of it is stored or shown.
 *
 * Every field here came, ultimately, from a page written by a stranger and read by a model. It is
 * untrusted in the strongest sense the app deals with: not merely "might be wrong" but "might have
 * been written specifically to be read by an AI and acted on". So this module assumes hostility —
 * it strips markup, bounds every length, and above all refuses any URL that is not plain
 * http/https, because a `javascript:` or `data:` href rendered as a clickable "website" link would
 * turn a research result into a click-to-execute.
 *
 * What it deliberately does NOT do is judge whether a supplier is real, appropriate or honestly
 * described. It cannot, and pretending otherwise would be worse than useless. That judgement is
 * the human's, which is why candidates go to `bm_vendor_candidates` for review rather than into
 * the vendor list.
 */

export interface VendorCandidate {
  name: string;
  summary: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  sourceUrl?: string;
}

const MAX_CANDIDATES = 8;

/** Generous but bounded: a summary is two sentences, an address is one line. */
const LIMITS = { name: 200, summary: 600, website: 500, phone: 60, email: 200, address: 300, sourceUrl: 500 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Plain text: tags stripped, whitespace collapsed, length capped. */
function clean(raw: unknown, limit: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * A URL safe to render as an `href`. Only http and https — anything else is dropped entirely
 * rather than sanitised into something that looks fine and is not.
 *
 * Parsed with `URL` rather than pattern-matched: a regex over URLs is a losing game against
 * whitespace tricks, embedded credentials and encoded schemes, and `URL` already knows the rules.
 */
export function safeExternalUrl(raw: unknown, limit = LIMITS.website): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > limit) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  // Credentials in a URL are a phishing shape (`https://real-site.com@evil.example`), never
  // something a genuine supplier listing needs.
  if (parsed.username || parsed.password) return undefined;
  return parsed.toString();
}

/** An address shaped like an email. Not proof it exists — just that it is not something else. */
export function safeEmail(raw: unknown): string | undefined {
  const value = clean(raw, LIMITS.email);
  if (!value) return undefined;
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(value) ? value : undefined;
}

/** Digits, spaces and the punctuation real numbers use. Anything else is not a phone number. */
export function safePhone(raw: unknown): string | undefined {
  const value = clean(raw, LIMITS.phone);
  if (!value) return undefined;
  if (!/^[+()\d\s.-]+$/.test(value)) return undefined;
  // At least a few digits, so "---" or "()" is not accepted as a number.
  return (value.match(/\d/g)?.length ?? 0) >= 6 ? value : undefined;
}

export interface CandidateParseResult {
  candidates: VendorCandidate[];
  /** Reasons things were dropped, for the review screen's own honesty. */
  notes: string[];
}

export function parseVendorCandidates(raw: unknown): CandidateParseResult {
  const notes: string[] = [];

  const list = isRecord(raw) && Array.isArray(raw.candidates) ? raw.candidates : Array.isArray(raw) ? raw : null;
  if (!list) return { candidates: [], notes: ['The research result was not a list of suppliers.'] };

  if (list.length > MAX_CANDIDATES) notes.push(`Only the first ${MAX_CANDIDATES} suppliers were kept.`);

  const candidates: VendorCandidate[] = [];
  let droppedUrls = 0;

  for (const entry of list.slice(0, MAX_CANDIDATES)) {
    if (!isRecord(entry)) continue;

    const name = clean(entry.name, LIMITS.name);
    // A candidate with no name is not a suggestion, it is a blank row.
    if (!name) continue;

    const website = safeExternalUrl(entry.website);
    const sourceUrl = safeExternalUrl(entry.sourceUrl);
    if (entry.website && !website) droppedUrls += 1;
    if (entry.sourceUrl && !sourceUrl) droppedUrls += 1;

    candidates.push({
      name,
      summary: clean(entry.summary, LIMITS.summary),
      website,
      sourceUrl,
      phone: safePhone(entry.phone),
      email: safeEmail(entry.email),
      address: clean(entry.address, LIMITS.address) || undefined,
    });
  }

  if (droppedUrls > 0) {
    notes.push(`${droppedUrls} ${droppedUrls === 1 ? 'link was' : 'links were'} dropped for not being an ordinary web address.`);
  }
  if (candidates.length === 0) notes.push('No usable suppliers came back.');

  return { candidates, notes };
}
