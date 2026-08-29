import { describe, expect, it } from 'vitest';
import { planRoomLayout, type LayoutRect, type PlannedTable } from './roomLayout';
import { tableFootprint } from './tableGeometry';

/**
 * The cases worth pinning are the ones that would embarrass a family at the venue: tables that
 * overlap, tables standing on the dance floor, a mechitza with a table straddling it, and a
 * planner that claims a fit it does not have.
 */

/** A 20m x 15m hall — the size the canvas used to hard-code, so a useful reference point. */
const HALL = { roomWidth: 2000, roomLength: 1500 };

function footprintOf(table: PlannedTable) {
  const fp = tableFootprint(table.width, table.height);
  return {
    minX: table.x - fp.width / 2,
    maxX: table.x + fp.width / 2,
    minY: table.y - fp.height / 2,
    maxY: table.y + fp.height / 2,
  };
}

function anyOverlap(tables: PlannedTable[]): boolean {
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = footprintOf(tables[i]);
      const b = footprintOf(tables[j]);
      if (a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY) return true;
    }
  }
  return false;
}

describe('planRoomLayout — basics', () => {
  it('fills a hall with round tables and seats everyone when there is room', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 80 });
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.seatedCapacity).toBeGreaterThanOrEqual(80);
    expect(result.unplacedGuests).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('never overlaps two table footprints', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 200 });
    expect(anyOverlap(result.tables)).toBe(false);
  });

  it('keeps every footprint inside the room, not just every table centre', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 200 });
    for (const table of result.tables) {
      const fp = footprintOf(table);
      expect(fp.minX).toBeGreaterThanOrEqual(0);
      expect(fp.minY).toBeGreaterThanOrEqual(0);
      expect(fp.maxX).toBeLessThanOrEqual(HALL.roomWidth);
      expect(fp.maxY).toBeLessThanOrEqual(HALL.roomLength);
    }
  });

  it('places no more tables than the guest list needs', () => {
    // 20 guests at 8 a table is 3 tables, even though the hall would hold far more.
    const result = planRoomLayout({ ...HALL, guestCount: 20 });
    expect(result.tables).toHaveLength(3);
  });

  it('honours a seats-per-table override from the caterer', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 60, seatsPerTable: 10 });
    expect(result.tables).toHaveLength(6);
    expect(result.seatedCapacity).toBe(60);
  });

  it('fits fewer long tables than round ones in the same hall, since they take more floor', () => {
    const round = planRoomLayout({ ...HALL, guestCount: 500, tableKind: 'table_round' });
    const long = planRoomLayout({ ...HALL, guestCount: 500, tableKind: 'table_long' });
    expect(long.tables.length).toBeLessThan(round.tables.length);
  });
});

describe('planRoomLayout — honesty when the room is too small', () => {
  it('reports unplaced guests rather than overlapping tables to make the number work', () => {
    const result = planRoomLayout({ roomWidth: 600, roomLength: 600, guestCount: 200 });
    expect(result.unplacedGuests).toBeGreaterThan(0);
    expect(anyOverlap(result.tables)).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/nowhere to sit/i);
  });

  it('places nothing, and says so, in a room smaller than one table', () => {
    const result = planRoomLayout({ roomWidth: 300, roomLength: 300, guestCount: 40 });
    expect(result.tables).toEqual([]);
    expect(result.unplacedGuests).toBe(40);
    expect(result.warnings.join(' ')).toMatch(/no tables fit/i);
  });

  it('handles a room entirely consumed by its own perimeter clearance', () => {
    const result = planRoomLayout({ roomWidth: 150, roomLength: 150, guestCount: 10, perimeterClearance: 100 });
    expect(result.tables).toEqual([]);
    expect(result.unplacedGuests).toBe(10);
    expect(result.warnings.join(' ')).toMatch(/no usable floor/i);
  });

  it('does not divide by zero or loop forever on a zero guest count', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 0 });
    expect(result.tables).toEqual([]);
    expect(result.unplacedGuests).toBe(0);
  });
});

describe('planRoomLayout — reserved zones', () => {
  const danceFloor: LayoutRect = { x: 1000, y: 750, width: 400, height: 400 };

  it('leaves the dance floor clear', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 200, reserved: [danceFloor] });
    const zone = {
      minX: danceFloor.x - danceFloor.width / 2,
      maxX: danceFloor.x + danceFloor.width / 2,
      minY: danceFloor.y - danceFloor.height / 2,
      maxY: danceFloor.y + danceFloor.height / 2,
    };
    for (const table of result.tables) {
      const fp = footprintOf(table);
      const hits = fp.minX < zone.maxX && fp.maxX > zone.minX && fp.minY < zone.maxY && fp.maxY > zone.minY;
      expect(hits).toBe(false);
    }
  });

  it('fits fewer tables once a dance floor takes up the middle', () => {
    const without = planRoomLayout({ ...HALL, guestCount: 500 });
    const with_ = planRoomLayout({ ...HALL, guestCount: 500, reserved: [danceFloor] });
    expect(with_.tables.length).toBeLessThan(without.tables.length);
  });
});

describe('planRoomLayout — mechitza', () => {
  it('returns a partition spanning the room on the dividing axis', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 80, mechitza: { axis: 'vertical' } });
    expect(result.mechitza).not.toBeNull();
    expect(result.mechitza?.kind).toBe('mechitza');
    expect(result.mechitza?.x).toBe(HALL.roomWidth / 2);
    expect(result.mechitza?.height).toBe(HALL.roomLength);
  });

  it('never lets a table straddle a vertical mechitza', () => {
    const at = HALL.roomWidth / 2;
    const result = planRoomLayout({ ...HALL, guestCount: 160, mechitza: { axis: 'vertical', position: at } });
    expect(result.tables.length).toBeGreaterThan(0);
    for (const table of result.tables) {
      const fp = footprintOf(table);
      // Wholly one side or wholly the other — never spanning the line.
      expect(fp.maxX <= at || fp.minX >= at).toBe(true);
    }
  });

  it('never lets a table straddle a horizontal mechitza', () => {
    const at = HALL.roomLength / 2;
    const result = planRoomLayout({ ...HALL, guestCount: 160, mechitza: { axis: 'horizontal', position: at } });
    expect(result.tables.length).toBeGreaterThan(0);
    for (const table of result.tables) {
      const fp = footprintOf(table);
      expect(fp.maxY <= at || fp.minY >= at).toBe(true);
    }
  });

  it('tags every table with the side it stands on, and uses both sides', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 160, mechitza: { axis: 'vertical' } });
    const sides = new Set(result.tables.map((t) => t.side));
    expect(sides.has('a')).toBe(true);
    expect(sides.has('b')).toBe(true);
    expect(sides.has(null)).toBe(false);
  });

  it('leaves side null when there is no mechitza', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 40 });
    expect(result.tables.every((t) => t.side === null)).toBe(true);
  });

  it('respects an off-centre partition, giving the larger side more tables', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 300, mechitza: { axis: 'vertical', position: 1400 } });
    const a = result.tables.filter((t) => t.side === 'a').length;
    const b = result.tables.filter((t) => t.side === 'b').length;
    expect(a).toBeGreaterThan(b);
  });

  it('warns when one side is too narrow to hold a table at all', () => {
    const result = planRoomLayout({ ...HALL, guestCount: 80, mechitza: { axis: 'vertical', position: 250 } });
    expect(result.warnings.join(' ')).toMatch(/too narrow/i);
  });

  it('still fits fewer tables than the same room undivided', () => {
    const undivided = planRoomLayout({ ...HALL, guestCount: 500 });
    const divided = planRoomLayout({ ...HALL, guestCount: 500, mechitza: { axis: 'vertical' } });
    expect(divided.tables.length).toBeLessThanOrEqual(undivided.tables.length);
  });
});
