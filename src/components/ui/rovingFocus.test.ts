import { describe, expect, it } from 'vitest';
import { nextRovingIndex, resolveStopIndex, typeaheadIndex } from './rovingFocus';

describe('nextRovingIndex — horizontal (Tabs)', () => {
  it('moves right and wraps past the last item to the first', () => {
    expect(nextRovingIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(nextRovingIndex(1, 3, 'ArrowRight')).toBe(2);
    expect(nextRovingIndex(2, 3, 'ArrowRight')).toBe(0); // wraps
  });

  it('moves left and wraps past the first item to the last', () => {
    expect(nextRovingIndex(2, 3, 'ArrowLeft')).toBe(1);
    expect(nextRovingIndex(1, 3, 'ArrowLeft')).toBe(0);
    expect(nextRovingIndex(0, 3, 'ArrowLeft')).toBe(2); // wraps
  });

  it('Home jumps to the first tab regardless of current position', () => {
    expect(nextRovingIndex(2, 5, 'Home')).toBe(0);
    expect(nextRovingIndex(0, 5, 'Home')).toBe(0);
  });

  it('End jumps to the last tab regardless of current position', () => {
    expect(nextRovingIndex(0, 5, 'End')).toBe(4);
    expect(nextRovingIndex(3, 5, 'End')).toBe(4);
  });

  it('arrows into the strip from the edge when nothing is currently selected', () => {
    expect(nextRovingIndex(-1, 4, 'ArrowRight')).toBe(0);
    expect(nextRovingIndex(-1, 4, 'ArrowLeft')).toBe(3);
  });

  it('returns null for a key the strip does not own, leaving Tab/Enter/typing untouched', () => {
    expect(nextRovingIndex(1, 3, 'Tab')).toBeNull();
    expect(nextRovingIndex(1, 3, 'Enter')).toBeNull();
    expect(nextRovingIndex(1, 3, 'a')).toBeNull();
  });

  it('returns null when the strip is empty', () => {
    expect(nextRovingIndex(0, 0, 'ArrowRight')).toBeNull();
  });

  it('a single-tab strip wraps to itself', () => {
    expect(nextRovingIndex(0, 1, 'ArrowRight')).toBe(0);
    expect(nextRovingIndex(0, 1, 'ArrowLeft')).toBe(0);
  });
});

describe('nextRovingIndex — vertical (Menu)', () => {
  it('ArrowDown/ArrowUp move and wrap, not ArrowLeft/ArrowRight', () => {
    expect(nextRovingIndex(0, 3, 'ArrowDown', 'vertical')).toBe(1);
    expect(nextRovingIndex(0, 3, 'ArrowUp', 'vertical')).toBe(2);
    expect(nextRovingIndex(0, 3, 'ArrowRight', 'vertical')).toBeNull();
  });

  it('Home/End still work regardless of orientation', () => {
    expect(nextRovingIndex(1, 4, 'Home', 'vertical')).toBe(0);
    expect(nextRovingIndex(1, 4, 'End', 'vertical')).toBe(3);
  });
});

describe('resolveStopIndex — exactly one tab is ever the roving stop', () => {
  it('uses the selected index when it is a real position in the strip', () => {
    for (let count = 1; count <= 8; count += 1) {
      for (let selected = 0; selected < count; selected += 1) {
        expect(resolveStopIndex(selected, count)).toBe(selected);
      }
    }
  });

  it('falls back to the first item when the selected index is not in the strip', () => {
    expect(resolveStopIndex(-1, 5)).toBe(0);
    expect(resolveStopIndex(99, 5)).toBe(0);
  });

  it('for every count and every possible selection, exactly one index resolves as the stop', () => {
    // The property the component relies on: mapping every item's own index against the
    // resolved stop yields true for precisely one of them, never zero and never more than one.
    for (let count = 1; count <= 6; count += 1) {
      for (let selected = -1; selected <= count; selected += 1) {
        const stop = resolveStopIndex(selected, count);
        const flags = Array.from({ length: count }, (_, i) => i === stop);
        expect(flags.filter(Boolean)).toHaveLength(1);
      }
    }
  });
});

describe('typeaheadIndex', () => {
  const labels = ['Guests', 'Vendors', 'Budget', 'Documents'];

  it('jumps to the next item starting with the pressed letter', () => {
    expect(typeaheadIndex(labels, 0, 'b')).toBe(2); // "Budget"
  });

  it('cycles past the currently active match to the next one on repeat presses', () => {
    const twoGs = ['Guests', 'Gifts', 'Vendors'];
    expect(typeaheadIndex(twoGs, 0, 'g')).toBe(1); // from "Guests", next "g" is "Gifts"
    expect(typeaheadIndex(twoGs, 1, 'g')).toBe(0); // from "Gifts", wraps back to "Guests"
  });

  it('is case-insensitive', () => {
    expect(typeaheadIndex(labels, 0, 'V')).toBe(1);
  });

  it('returns null when no label starts with the pressed key', () => {
    expect(typeaheadIndex(labels, 0, 'z')).toBeNull();
  });

  it('returns null for a non-printable or multi-character key', () => {
    expect(typeaheadIndex(labels, 0, 'ArrowDown')).toBeNull();
  });
});
