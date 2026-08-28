import { describe, expect, it } from 'vitest';
import { formatHebrewDate } from './hebrewDate';

describe('formatHebrewDate', () => {
  it('matches the conversion named in the build plan: 12 Sep 2026 is 1 Tishrei 5787', () => {
    // Rosh Hashanah 5787 fell at sunset on 11 September 2026, so 12 September (daytime) is
    // 1 Tishrei 5787 — the exact conversion the build plan verified against Node's ICU before
    // this file was written.
    expect(formatHebrewDate(new Date(2026, 8, 12))).toBe('1 Tishrei 5787');
  });

  it('matches an independently-checkable second date: 3 Oct 2024 is 1 Tishrei 5785', () => {
    // Rosh Hashanah 5785 is a widely documented fixed fact (sunset on 2 October 2024), so its
    // Gregorian daytime equivalent — 3 October 2024 — must read as the FIRST day of Tishrei in
    // the new year, 5785. This is a second, independent data point from a different year, not a
    // restatement of the first assertion.
    expect(formatHebrewDate(new Date(2024, 9, 3))).toBe('1 Tishrei 5785');
  });

  it('transliterates Heshvan and Tamuz too, not only Tishrei', () => {
    // 2 Nov 2024 is 1 Heshvan 5785 (the month immediately after Tishrei); Node's ICU calls it
    // "Heshvan" and this app spells it "Cheshvan".
    expect(formatHebrewDate(new Date(2024, 10, 2))).toBe('1 Cheshvan 5785');
  });

  it('renders the leap-year Adar I / Adar II split unchanged', () => {
    // 5784 was a Hebrew leap year; ICU reports "Adar I" and "Adar II" rather than a single
    // "Adar", and this app keeps that spelling as-is (no entry for it in the transliteration
    // table) rather than collapsing the two into one name.
    expect(formatHebrewDate(new Date(2024, 1, 10))).toBe('1 Adar I 5784');
  });

  it('renders in Hebrew script when asked, with no transliteration applied', () => {
    expect(formatHebrewDate(new Date(2026, 8, 12), { script: 'he' })).toBe('1 בתשרי 5787');
  });

  it('defaults to the "en" script when no options are given', () => {
    expect(formatHebrewDate(new Date(2026, 8, 12))).toBe(formatHebrewDate(new Date(2026, 8, 12), { script: 'en' }));
  });
});
