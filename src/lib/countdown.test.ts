import { describe, expect, it } from 'vitest';
import { daysUntil, formatCountdown } from './countdown';

const REF = new Date(2026, 5, 10, 14, 30); // 10 Jun 2026, 14:30 — a fixed "now" with a real time-of-day

describe('daysUntil', () => {
  it('is 0 when the target is today, regardless of time-of-day on either side', () => {
    expect(daysUntil(new Date(2026, 5, 10, 8, 0), REF)).toBe(0);
    expect(daysUntil(new Date(2026, 5, 10, 23, 59), REF)).toBe(0);
    // Even a target time EARLIER in the day than `from` must still read as "today", not -1 —
    // this is the whole point of comparing dates, not timestamps.
    expect(daysUntil(new Date(2026, 5, 10, 0, 1), REF)).toBe(0);
  });

  it('is 1 when the target is tomorrow', () => {
    expect(daysUntil(new Date(2026, 5, 11), REF)).toBe(1);
  });

  it('is -1 when the target was yesterday', () => {
    expect(daysUntil(new Date(2026, 5, 9), REF)).toBe(-1);
  });

  it('counts forward correctly for a target weeks away', () => {
    expect(daysUntil(new Date(2026, 6, 10), REF)).toBe(30); // 10 Jun -> 10 Jul 2026 is 30 days
  });

  it('counts backward correctly for a target in the past', () => {
    expect(daysUntil(new Date(2026, 3, 10), REF)).toBe(-61); // 10 Apr -> 10 Jun 2026 is 61 days
  });

  it('defaults `from` to now when omitted', () => {
    const inTenDays = new Date();
    inTenDays.setDate(inTenDays.getDate() + 10);
    expect(daysUntil(inTenDays)).toBe(10);
  });
});

describe('formatCountdown', () => {
  it('says "Today" for a same-day target', () => {
    expect(formatCountdown(new Date(2026, 5, 10, 9, 0), REF)).toBe('Today');
  });

  it('says "Tomorrow" for a next-day target', () => {
    expect(formatCountdown(new Date(2026, 5, 11), REF)).toBe('Tomorrow');
  });

  it('says "Yesterday" for a target one day in the past', () => {
    expect(formatCountdown(new Date(2026, 5, 9), REF)).toBe('Yesterday');
  });

  it('says "N days to go" for a future target beyond tomorrow', () => {
    expect(formatCountdown(new Date(2026, 5, 20), REF)).toBe('10 days to go');
  });

  it('says "N days ago" for a past target beyond yesterday', () => {
    expect(formatCountdown(new Date(2026, 5, 1), REF)).toBe('9 days ago');
  });
});
