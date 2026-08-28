/**
 * Every date, number and money value this app renders or reads back goes through one of these.
 *
 * The alternative for dates — a bare `new Date(x).toLocaleDateString()` — formats to whatever
 * locale the *browser* happens to be set to, so the same record reads "10/06/2026" to one family
 * member and "6/10/2026" to another, with nothing on screen to say which. This app is UK-only, so
 * every formatter below pins `'en-GB'` explicitly via `Intl`, rather than reaching for a date
 * library — see CLAUDE.md's dependency-avoidance list.
 *
 * They also accept null/undefined/invalid input and return an em dash, because most callers are
 * rendering a nullable column (an event not yet dated, a task with no due date) and every one of
 * them would otherwise repeat the same guard, or worse, print "Invalid Date" into the UI.
 */

const EMPTY = '—';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date-only string (the shape every `date` column in Postgres round-trips as, e.g.
 * "2026-07-04") built at LOCAL midnight rather than UTC midnight.
 *
 * `new Date('2026-07-04')` is parsed as UTC midnight, and every formatter below renders in the
 * browser's local time — so on any machine west of Greenwich (which, per the UK's own DST rules,
 * is every machine here for half the year is irrelevant; the bug is real for any UTC-negative
 * offset, e.g. a family member checking the app from the US) that prints 3 July, a day early.
 * Building the Date from the parsed y/m/d components sidesteps the UTC round-trip entirely, so
 * the digits in the string are the digits that render, on any machine, in any timezone.
 *
 * Exported (not just used internally by `toDate` below) for callers that need a real `Date`
 * object out of a date-only column — `formatCountdown`/`formatHebrewDate` both take a `Date`,
 * not a string — rather than a caller reaching for a bare `new Date(bm_events.event_date)` and
 * reintroducing the exact bug this function exists to avoid.
 */
export function toLocalDateOnly(value: string): Date | null {
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Reject "2026-02-30": JS Date rolls an out-of-range day into the next month instead of
  // erroring, which would silently render the wrong date rather than the em dash it should.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function toDate(date: Date | string | number | null | undefined): Date | null {
  if (date === null || date === undefined || date === '') return null;
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : date;
  if (typeof date === 'string' && DATE_ONLY.test(date)) {
    // A date-only string is handled ENTIRELY by the local-midnight path, success or failure —
    // it must never fall through to `new Date()` below. V8's own ISO parser does not reject an
    // impossible calendar date like "2026-02-30" either; it rolls it over to 2 March the same
    // way `new Date(2026, 1, 30)` would, which is exactly the wrong answer this guard exists to
    // stop from reaching the screen.
    return toLocalDateOnly(date);
  }
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

const enGB = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', options);

const DATE_FMT = enGB({ day: 'numeric', month: 'short', year: 'numeric' });
const DATE_LONG_FMT = enGB({ weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = enGB({ hour: '2-digit', minute: '2-digit', hour12: false });
const MONTH_YEAR_FMT = enGB({ month: 'short', year: 'numeric' });

/** `10 Jun 2026` — the default for record fields, tables and cards. */
export function formatDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  return d ? DATE_FMT.format(d) : EMPTY;
}

/** `Wednesday, 10 Jun 2026` — headers and confirmations where the weekday matters. */
export function formatDateLong(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  return d ? DATE_LONG_FMT.format(d) : EMPTY;
}

/** `10 Jun 2026, 14:05` — activity feeds and timelines. 24-hour, no am/pm. */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!d) return EMPTY;
  return `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)}`;
}

/** `14:05` — time only, for rows already grouped under a date. */
export function formatTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  return d ? TIME_FMT.format(d) : EMPTY;
}

/** `Jun 2026` — period headings, e.g. a payments-due-this-month grouping. */
export function formatMonthYear(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  return d ? MONTH_YEAR_FMT.format(d) : EMPTY;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

/** `£2,450.00` — always 2dp, en-GB grouping, £ symbol. Negative amounts keep the minus sign. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/* -------------------------------------------------------------------------------------------
   Parsing money back OUT of a form field.

   Distinguishes "empty" from "unparseable" because the two mean different things to a caller
   writing to a budget line. A BLANK field means "no figure given" — leave it alone, or treat it
   as zero, whichever the caller's own logic wants. A field holding "3.5o" (a typo for "3.5k")
   means someone typed a real answer and it could not be read — collapsing that to the same null
   as blank is how a genuinely-entered vendor quote gets silently dropped.

   Deliberately strict: `Number()`, not `parseFloat()`. `parseFloat('£1.25m')` reads a numeric
   prefix and discards the rest, returning 1.25 — a silently truncated deposit is worse than a
   reported failure.
------------------------------------------------------------------------------------------- */

/** Why a value produced no number. `'empty'` is benign; `'unparseable'` means someone meant something. */
export type MoneyParseReason = 'empty' | 'unparseable';

export interface MoneyParseResult {
  /** The parsed number, or null when there isn't one. */
  value: number | null;
  /** Present only when `value` is null. */
  reason?: MoneyParseReason;
}

export interface ParseMoneyOptions {
  /**
   * Accept the `k`/`m` shorthand: `100k` → 100000, `3.28m` → 3280000. OFF by default, and it
   * must stay off for anything that is not money — `indemnity_period_months`-shaped fields exist
   * in this app too (a duration in months), where `24m` means twenty-four MONTHS, and silently
   * expanding that to 24,000,000 would be far worse than refusing to read it.
   */
  allowShorthand?: boolean;
}

/** `k` → thousands, `m` → millions. */
const SHORTHAND_MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000 };

/**
 * Parse a money/number value that may arrive as a form string, a real number, or nothing. Strips
 * `£`, thousands commas and whitespace.
 *
 *   parseMoneyInput('£2,450.00')                          // { value: 2450 }
 *   parseMoneyInput('')                                   // { value: null, reason: 'empty' }
 *   parseMoneyInput('3.28m')                              // { value: null, reason: 'unparseable' }
 *   parseMoneyInput('3.28m', { allowShorthand: true })    // { value: 3280000 }
 *   parseMoneyInput('100k',  { allowShorthand: true })    // { value: 100000 }
 */
export function parseMoneyInput(value: unknown, options: ParseMoneyOptions = {}): MoneyParseResult {
  if (value === null || value === undefined) return { value: null, reason: 'empty' };

  // A real number (from the database, or a caller passing a number through) needs no parsing —
  // but NaN/Infinity are not figures anyone can act on.
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value } : { value: null, reason: 'unparseable' };
  }

  if (typeof value === 'boolean') return { value: null, reason: 'unparseable' };

  const cleaned = String(value).replace(/[£,\s]/g, '');
  if (!cleaned) return { value: null, reason: 'empty' };

  if (options.allowShorthand) {
    // A single trailing k/m on an otherwise complete number. Anchored and case-insensitive, so
    // "3.28mm", "m" alone and "1k2" all fall through to unparseable rather than half-read.
    const match = /^(-?\d+(?:\.\d+)?)([km])$/i.exec(cleaned);
    if (match) {
      const base = Number(match[1]);
      const multiplier = SHORTHAND_MULTIPLIER[match[2].toLowerCase()];
      if (Number.isFinite(base) && multiplier) {
        // Rounded to pennies so a float artefact like 1.0005m never lands on screen.
        return { value: Math.round(base * multiplier * 100) / 100 };
      }
    }
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? { value: n } : { value: null, reason: 'unparseable' };
}

/**
 * `parseMoneyInput` for callers that only want the figure — display formatting, a quick change
 * check. Anywhere the EMPTY/UNPARSEABLE distinction matters (writing to a budget line, validating
 * a form before save), use `parseMoneyInput` directly.
 */
export function parseMoneyOrNull(value: unknown, options: ParseMoneyOptions = {}): number | null {
  return parseMoneyInput(value, options).value;
}

/**
 * Rewrite what a money field shows once the handler leaves it: `3.28m` → `3,280,000`, `100k` →
 * `100,000`. Showing the expansion matters as much as accepting it — it is how someone confirms
 * "3.28m" was read as 3.28 million rather than 328,000.
 *
 * Anything unreadable is returned EXACTLY as typed, never blanked — losing what someone entered
 * is a worse outcome than leaving the validation to say it was wrong.
 */
export function normaliseMoneyInput(raw: string): string {
  const { value } = parseMoneyInput(raw, { allowShorthand: true });
  if (value == null) return raw;
  return formatNumber(value);
}
