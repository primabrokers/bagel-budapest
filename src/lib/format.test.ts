import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatMonthYear,
  formatNumber,
  formatTime,
  normaliseMoneyInput,
  parseMoneyInput,
  parseMoneyOrNull,
} from './format';

describe('formatDate', () => {
  it('formats a date-only string as "10 Jun 2026"', () => {
    expect(formatDate('2026-06-10')).toBe('10 Jun 2026');
  });

  it('formats a Date object the same way', () => {
    expect(formatDate(new Date(2026, 5, 10))).toBe('10 Jun 2026');
  });

  it('does not shift a date-only string by a day near a UTC boundary', () => {
    // The classic bug: new Date('2026-01-01') is UTC midnight, which is 31 Dec in any
    // negative-UTC-offset timezone. Every date-only string in this app must render on the day
    // its digits say, regardless of the machine's timezone.
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('returns an em dash for null, undefined and empty string', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns an em dash for an invalid date', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate('2026-02-30')).toBe('—'); // 30 Feb does not exist
  });
});

describe('formatDateLong', () => {
  it('includes the weekday', () => {
    // 10 June 2026 is a Wednesday.
    expect(formatDateLong('2026-06-10')).toBe('Wednesday, 10 Jun 2026');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatDateLong(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('renders 24-hour time with no am/pm', () => {
    expect(formatDateTime(new Date(2026, 5, 10, 14, 5))).toBe('10 Jun 2026, 14:05');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatDateTime(new Date(2026, 5, 10, 9, 3))).toBe('10 Jun 2026, 09:03');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('formatTime', () => {
  it('formats time only, 24-hour', () => {
    expect(formatTime(new Date(2026, 5, 10, 23, 59))).toBe('23:59');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatTime('')).toBe('—');
  });
});

describe('formatMonthYear', () => {
  it('formats as "Jun 2026"', () => {
    expect(formatMonthYear('2026-06-10')).toBe('Jun 2026');
  });
});

describe('formatNumber', () => {
  it('groups thousands with en-GB commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('formatCurrency', () => {
  it('formats a positive amount with two decimal places and the £ symbol', () => {
    expect(formatCurrency(2450)).toBe('£2,450.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });

  it('formats a negative amount, keeping the sign', () => {
    expect(formatCurrency(-42.5)).toBe('-£42.50');
  });

  it('formats a large amount with grouping', () => {
    expect(formatCurrency(1234567.8)).toBe('£1,234,567.80');
  });

  it('always shows two decimal places even for a whole number', () => {
    expect(formatCurrency(100)).toBe('£100.00');
  });
});

describe('parseMoneyInput', () => {
  it('reports empty for null, undefined and blank string, distinctly from unparseable', () => {
    expect(parseMoneyInput(null)).toEqual({ value: null, reason: 'empty' });
    expect(parseMoneyInput(undefined)).toEqual({ value: null, reason: 'empty' });
    expect(parseMoneyInput('')).toEqual({ value: null, reason: 'empty' });
    expect(parseMoneyInput('   ')).toEqual({ value: null, reason: 'empty' });
    expect(parseMoneyInput('£')).toEqual({ value: null, reason: 'empty' });
  });

  it('reports unparseable for a value someone clearly meant something by', () => {
    expect(parseMoneyInput('twelve pounds')).toEqual({ value: null, reason: 'unparseable' });
    expect(parseMoneyInput('12abc')).toEqual({ value: null, reason: 'unparseable' });
  });

  it('empty and unparseable never collapse to the same shape', () => {
    const empty = parseMoneyInput('');
    const bad = parseMoneyInput('abc');
    expect(empty.reason).not.toBe(bad.reason);
  });

  it('parses a plain number string, stripping £ and commas', () => {
    expect(parseMoneyInput('£2,450,000')).toEqual({ value: 2450000 });
    expect(parseMoneyInput('1250.50')).toEqual({ value: 1250.5 });
  });

  it('passes a real finite number straight through', () => {
    expect(parseMoneyInput(500)).toEqual({ value: 500 });
  });

  it('rejects NaN and Infinity even though they are numbers', () => {
    expect(parseMoneyInput(NaN)).toEqual({ value: null, reason: 'unparseable' });
    expect(parseMoneyInput(Infinity)).toEqual({ value: null, reason: 'unparseable' });
  });

  it('rejects a boolean', () => {
    expect(parseMoneyInput(true)).toEqual({ value: null, reason: 'unparseable' });
  });

  it('does NOT expand shorthand by default', () => {
    expect(parseMoneyInput('3.28m')).toEqual({ value: null, reason: 'unparseable' });
    expect(parseMoneyInput('100k')).toEqual({ value: null, reason: 'unparseable' });
  });

  it('expands k/m shorthand only when allowShorthand is set', () => {
    expect(parseMoneyInput('100k', { allowShorthand: true })).toEqual({ value: 100000 });
    expect(parseMoneyInput('3.28m', { allowShorthand: true })).toEqual({ value: 3280000 });
  });

  it('does not use parseFloat semantics — a trailing letter is not silently truncated', () => {
    // parseFloat('£1.25m') would be 1.25. This must not be.
    const result = parseMoneyInput('£1.25m');
    expect(result.value).toBe(null);
    expect(result.reason).toBe('unparseable');
  });

  it('rejects malformed shorthand even with allowShorthand on', () => {
    expect(parseMoneyInput('3.28mm', { allowShorthand: true })).toEqual({ value: null, reason: 'unparseable' });
    expect(parseMoneyInput('m', { allowShorthand: true })).toEqual({ value: null, reason: 'unparseable' });
  });
});

describe('parseMoneyOrNull', () => {
  it('collapses both empty and unparseable to null', () => {
    expect(parseMoneyOrNull('')).toBe(null);
    expect(parseMoneyOrNull('nonsense')).toBe(null);
  });

  it('returns the parsed value on success', () => {
    expect(parseMoneyOrNull('£99.99')).toBe(99.99);
  });
});

describe('normaliseMoneyInput', () => {
  it('expands shorthand into a grouped figure', () => {
    expect(normaliseMoneyInput('3.28m')).toBe('3,280,000');
    expect(normaliseMoneyInput('100k')).toBe('100,000');
  });

  it('re-groups a plain number', () => {
    expect(normaliseMoneyInput('2450000')).toBe('2,450,000');
  });

  it('round-trips: normalising an already-normalised value is a no-op', () => {
    const once = normaliseMoneyInput('3.28m');
    const twice = normaliseMoneyInput(once);
    expect(twice).toBe(once);
  });

  it('returns unreadable input exactly as typed, never blanked', () => {
    expect(normaliseMoneyInput('not a number')).toBe('not a number');
  });
});
