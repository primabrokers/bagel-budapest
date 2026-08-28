import { describe, expect, it } from 'vitest';
import { computeMilestoneDueDates, MILESTONE_TITLES, STANDARD_MILESTONES, toDateOnlyString } from './milestones';

describe('STANDARD_MILESTONES', () => {
  it('matches the eight milestones and offsets named in the build plan', () => {
    expect(STANDARD_MILESTONES.map((m) => m.offsetDays)).toEqual([
      -270, -120, -56, -28, -21, -14, -7, -3,
    ]);
    expect(STANDARD_MILESTONES).toHaveLength(8);
  });

  it('exposes every title in MILESTONE_TITLES', () => {
    for (const milestone of STANDARD_MILESTONES) {
      expect(MILESTONE_TITLES.has(milestone.title)).toBe(true);
    }
    expect(MILESTONE_TITLES.size).toBe(STANDARD_MILESTONES.length);
  });
});

describe('computeMilestoneDueDates', () => {
  it('computes each due date as the exact day-offset from the event date', () => {
    // 24 October 2026 — a Saturday, chosen arbitrarily; the maths only cares about day counts.
    const eventDate = new Date(2026, 9, 24);

    const dueDates = computeMilestoneDueDates(eventDate);

    expect(dueDates.map((d) => toDateOnlyString(d.dueDate))).toEqual([
      '2026-01-27', // -270 days
      '2026-06-26', // -120 days
      '2026-08-29', // -56 days
      '2026-09-26', // -28 days
      '2026-10-03', // -21 days
      '2026-10-10', // -14 days
      '2026-10-17', // -7 days
      '2026-10-21', // -3 days
    ]);
  });

  it('preserves the titles in the same order as STANDARD_MILESTONES', () => {
    const dueDates = computeMilestoneDueDates(new Date(2026, 9, 24));
    expect(dueDates.map((d) => d.title)).toEqual(STANDARD_MILESTONES.map((m) => m.title));
  });

  it('does not clamp a past due date forward — a family starting late sees genuinely overdue dates', () => {
    // An event date in the past relative to "today" in this test is irrelevant to the function
    // itself (it takes no "now"), but the milestones for a NEAR event date should still land in
    // the past without being pulled forward.
    const nearEventDate = new Date(2026, 8, 1); // 1 Sep 2026
    const dueDates = computeMilestoneDueDates(nearEventDate);

    // "Book the venue" at -270 days from 1 Sep 2026 is 5 Dec 2025 — long past relative to the
    // event date itself, and the function must return that real, unclamped date.
    expect(toDateOnlyString(dueDates[0].dueDate)).toBe('2025-12-05');
  });

  it('handles a leap-year February correctly when an offset crosses it', () => {
    // 2028 is a leap year. 10 March 2028 minus 14 days crosses 29 Feb.
    const eventDate = new Date(2028, 2, 10);
    const dueDates = computeMilestoneDueDates(eventDate);
    const confirmNumbers = dueDates.find((d) => d.title === 'Confirm final numbers');
    expect(confirmNumbers && toDateOnlyString(confirmNumbers.dueDate)).toBe('2028-02-25');
  });
});

describe('toDateOnlyString', () => {
  it('formats using local calendar fields, zero-padded', () => {
    expect(toDateOnlyString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateOnlyString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
