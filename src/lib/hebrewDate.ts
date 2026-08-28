/**
 * The Hebrew calendar date for an event or function, computed entirely from `Intl` — no
 * calendar-maths library, per CLAUDE.md's dependency-avoidance list. `Intl.DateTimeFormat`'s
 * `-u-ca-hebrew` calendar extension does the actual conversion; this only chooses how the result
 * reads.
 *
 * Verified against a fact independently checkable without this code: Rosh Hashanah 5785 fell at
 * sunset on 2 October 2024, so the Hebrew calendar's 1 Tishrei 5785 is the Gregorian daytime of
 * 3 October 2024 — see hebrewDate.test.ts, which pins exactly that date alongside the one named
 * in the build plan (12 September 2026 → 1 Tishrei 5787).
 */

export type HebrewScript = 'en' | 'he';

/**
 * Node's ICU (checked directly — see the comment above each entry) spells a few month names
 * differently from the transliteration this app's UK-Jewish audience actually expects. Only
 * entries that differ are listed; every other month (Adar, Adar I, Adar II, Nisan, Iyar, Sivan,
 * Av, Elul, Shevat, Kislev, Tevet) already matches and passes through unchanged.
 */
const MONTH_TRANSLITERATION: Record<string, string> = {
  Tishri: 'Tishrei', // ICU: "Tishri"
  Heshvan: 'Cheshvan', // ICU: "Heshvan"
  Tamuz: 'Tammuz', // ICU: "Tamuz"
};

const EN_FORMATTER = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const HE_FORMATTER = new Intl.DateTimeFormat('he-u-ca-hebrew', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * `formatHebrewDate(new Date(2026, 8, 12))` → `'12 Sep 2026'`'s Hebrew calendar equivalent,
 * `'1 Tishrei 5787'`. `script: 'he'` renders in Hebrew characters instead (`'1 בתשרי 5787'`) —
 * the Hebrew calendar's own script needs no transliteration table, ICU already gives the native
 * spelling.
 */
export function formatHebrewDate(date: Date, opts: { script?: HebrewScript } = {}): string {
  if ((opts.script ?? 'en') === 'he') return HE_FORMATTER.format(date);

  // Reassembling from formatToParts (rather than a find-and-replace on the formatted string)
  // means the day/month/year order and the literal separators between them stay exactly what
  // ICU produced — only the month NAME is substituted.
  return EN_FORMATTER.formatToParts(date)
    .map((part) => (part.type === 'month' ? (MONTH_TRANSLITERATION[part.value] ?? part.value) : part.value))
    .join('');
}
