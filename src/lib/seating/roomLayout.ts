import { defaultObjectSize, tableFootprint } from './tableGeometry';
import type { FloorObjectKind } from '../../data/seating/types';

/**
 * Works out what actually fits in a real room: how many round or long tables, where they stand,
 * and where a mechitza divides them — from the hall's own measurements rather than the fixed
 * 20m x 15m the canvas used to assume.
 *
 * Pure geometry, no React and no Supabase, so the awkward cases can be tested rather than
 * discovered at a venue. Everything is in centimetres, matching `bm_floor_objects`, and every
 * position returned is an object CENTRE — the convention `objectGeometry` and `FloorCanvas` use.
 *
 * The honesty rule this module is built around: when the room cannot hold the guest list, it says
 * so in `unplacedGuests` and stops. It never shrinks clearances, overlaps footprints, or quietly
 * seats ten at an eight-seat table to make the number come out. A planner that always says "yes"
 * is worse than useless the evening a family is standing in a hall with too few tables.
 */

/** Axis-aligned rectangle described by its CENTRE, like every floor object. */
export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MechitzaAxis = 'vertical' | 'horizontal';

export interface MechitzaSpec {
  /** `vertical` stands the partition top-to-bottom, dividing the room left/right. */
  axis: MechitzaAxis;
  /** Centre position along the axis it divides, in cm. Defaults to the middle of the room. */
  position?: number;
  /** Total clear space kept around the partition so people can pass. */
  clearance?: number;
}

export interface RoomLayoutInput {
  roomWidth: number;
  roomLength: number;
  /** How many people need seats. Tables are placed until this is met or the room runs out. */
  guestCount: number;
  /** Round by default — the usual choice for a simcha, and it seats more per square metre. */
  tableKind?: Extract<FloorObjectKind, 'table_round' | 'table_long' | 'table_rect' | 'table_square'>;
  /** Overrides the kind's default capacity when a caterer's tables seat something else. */
  seatsPerTable?: number;
  mechitza?: MechitzaSpec | null;
  /** Keep-out zones already in the room — dance floor, stage, bar, top table. */
  reserved?: LayoutRect[];
  /** Clear floor kept against the walls, for egress and circulation. */
  perimeterClearance?: number;
  /** Gap between one table's footprint and the next, for waiting staff to pass. */
  aisleWidth?: number;
}

/** Which side of a mechitza a table stands on. `null` when there is no mechitza. */
export type MechitzaSide = 'a' | 'b' | null;

export interface PlannedTable extends LayoutRect {
  kind: FloorObjectKind;
  capacity: number;
  side: MechitzaSide;
}

export interface RoomLayoutResult {
  tables: PlannedTable[];
  /** The partition itself, ready to store as a `mechitza` floor object. */
  mechitza: (LayoutRect & { kind: 'mechitza' }) | null;
  seatedCapacity: number;
  /** Guests with nowhere to sit. Non-zero means the room is genuinely too small. */
  unplacedGuests: number;
  warnings: string[];
}

/** 1m of clear floor against the walls. Below this a room stops being walkable at the edges. */
const DEFAULT_PERIMETER_CLEARANCE = 100;
/** 90cm between footprints — enough for a person to pass a seated guest carrying a plate. */
const DEFAULT_AISLE = 90;
/** 120cm total around a mechitza, so the partition does not pin anyone against a table. */
const DEFAULT_MECHITZA_CLEARANCE = 120;
/** A mechitza is a partition, not a wall: thin, but thick enough to see and to grab on the canvas. */
const MECHITZA_THICKNESS = 20;

/** Internal bounds in min/max form — easier to reason about than centre+size while packing. */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function boundsWidth(b: Bounds): number {
  return b.maxX - b.minX;
}

function boundsHeight(b: Bounds): number {
  return b.maxY - b.minY;
}

function rectToBounds(rect: LayoutRect): Bounds {
  return {
    minX: rect.x - rect.width / 2,
    minY: rect.y - rect.height / 2,
    maxX: rect.x + rect.width / 2,
    maxY: rect.y + rect.height / 2,
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  // Touching edges is not an overlap — two footprints sharing a boundary line is a perfect fit,
  // not a collision.
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Grid-packs as many table centres as will fit inside `region`, skipping any cell whose footprint
 * would land on a reserved zone. The grid is centred in the region rather than pushed into a
 * corner, because a hall with all its tables shoved to one wall looks like a mistake even when the
 * arithmetic is right.
 */
function packRegion(
  region: Bounds,
  cellWidth: number,
  cellHeight: number,
  footprintWidth: number,
  footprintHeight: number,
  reserved: Bounds[],
  limit: number,
): { x: number; y: number }[] {
  const cols = Math.floor(boundsWidth(region) / cellWidth);
  const rows = Math.floor(boundsHeight(region) / cellHeight);
  if (cols <= 0 || rows <= 0 || limit <= 0) return [];

  const gridWidth = cols * cellWidth;
  const gridHeight = rows * cellHeight;
  const startX = region.minX + (boundsWidth(region) - gridWidth) / 2;
  const startY = region.minY + (boundsHeight(region) - gridHeight) / 2;

  const placed: { x: number; y: number }[] = [];

  for (let row = 0; row < rows && placed.length < limit; row++) {
    for (let col = 0; col < cols && placed.length < limit; col++) {
      const x = startX + (col + 0.5) * cellWidth;
      const y = startY + (row + 0.5) * cellHeight;

      // The cell includes the aisle, but only the FOOTPRINT has to be clear of the dance floor —
      // an aisle may legitimately run alongside one. Testing the cell would refuse valid layouts.
      const footprint: Bounds = {
        minX: x - footprintWidth / 2,
        maxX: x + footprintWidth / 2,
        minY: y - footprintHeight / 2,
        maxY: y + footprintHeight / 2,
      };

      if (reserved.some((zone) => overlaps(footprint, zone))) continue;
      placed.push({ x, y });
    }
  }

  return placed;
}

/**
 * The partition itself, as a rectangle spanning the whole room across the axis it divides.
 *
 * Exported because two callers need the identical geometry and must not drift apart: the room
 * planner builds one as part of a whole layout, and adding a mechitza by hand from the canvas
 * builds one on its own. A hand-added partition used to get `defaultObjectSize('mechitza')` — a
 * fixed 20 x 600cm bar — which in a 15m-deep hall divides less than half the room and cannot be
 * resized from anywhere in the app. A mechitza that only half crosses the room is not a mechitza.
 *
 * `position` is the centre along the divided axis, clamped inside the room so a typed-in value
 * can never put the partition through a wall. It defaults to the middle.
 */
export function mechitzaObject(
  roomWidth: number,
  roomLength: number,
  axis: MechitzaAxis,
  position?: number,
): LayoutRect & { kind: 'mechitza' } {
  const half = MECHITZA_THICKNESS / 2;
  if (axis === 'vertical') {
    const at = clamp(position ?? roomWidth / 2, half, Math.max(half, roomWidth - half));
    return { kind: 'mechitza', x: at, y: roomLength / 2, width: MECHITZA_THICKNESS, height: roomLength };
  }
  const at = clamp(position ?? roomLength / 2, half, Math.max(half, roomLength - half));
  return { kind: 'mechitza', x: roomWidth / 2, y: at, width: roomWidth, height: MECHITZA_THICKNESS };
}

/** Clear floor left between one hand-added object and the next, so each is separately grabbable. */
const NEW_OBJECT_GAP = 30;

/**
 * Where a hand-added object should land: out from the middle of the room, stepped by `index` so a
 * run of additions fans out instead of stacking, and CLAMPED so the whole object stays inside the
 * room.
 *
 * Both halves are there because of the same complaint — "adding a table does nothing".
 *
 * The clamp: new objects used to be placed at the centre of a hard-coded 20m x 15m room, which was
 * fine while every room was that size. Once a family measures a smaller hall, an unclamped centre
 * lands outside the viewBox — the row is written to the database and never drawn.
 *
 * The step: it is a whole object wide, and `index` counts EVERY object in the plan rather than
 * every object of this kind, so a table added after a dance floor does not land underneath it. A
 * new table hidden under the one before it looks exactly like a table that was never added.
 */
export function placeNewObject(
  roomWidth: number,
  roomLength: number,
  width: number,
  height: number,
  index = 0,
): { x: number; y: number } {
  const halfW = width / 2;
  const halfH = height / 2;
  const step = Math.max(width, height) + NEW_OBJECT_GAP;
  // How far the CENTRE may travel before the object would leave the room.
  const travel = Math.min(Math.max(0, roomWidth - width), Math.max(0, roomLength - height));
  // Wrap the fan-out rather than letting it march at a wall: past the far corner it starts again
  // from the middle, which in a room that full is the honest answer anyway.
  const drift = (Math.max(0, Math.round(index)) * step) % Math.max(step, travel || step);
  return {
    x: clamp(roomWidth / 2 + drift, halfW, Math.max(halfW, roomWidth - halfW)),
    y: clamp(roomLength / 2 + drift, halfH, Math.max(halfH, roomLength - halfH)),
  };
}

export function planRoomLayout(input: RoomLayoutInput): RoomLayoutResult {
  const warnings: string[] = [];
  const {
    roomWidth,
    roomLength,
    guestCount,
    tableKind = 'table_round',
    mechitza = null,
    reserved = [],
    perimeterClearance = DEFAULT_PERIMETER_CLEARANCE,
    aisleWidth = DEFAULT_AISLE,
  } = input;

  const defaults = defaultObjectSize(tableKind);
  const seatsPerTable = Math.max(1, input.seatsPerTable ?? defaults.capacity ?? 8);
  const footprint = tableFootprint(defaults.width, defaults.height);
  const cellWidth = footprint.width + aisleWidth;
  const cellHeight = footprint.height + aisleWidth;

  const usable: Bounds = {
    minX: perimeterClearance,
    minY: perimeterClearance,
    maxX: roomWidth - perimeterClearance,
    maxY: roomLength - perimeterClearance,
  };

  if (boundsWidth(usable) <= 0 || boundsHeight(usable) <= 0) {
    return {
      tables: [],
      mechitza: null,
      seatedCapacity: 0,
      unplacedGuests: guestCount,
      warnings: [`A ${roomWidth / 100}m x ${roomLength / 100}m room has no usable floor once ${perimeterClearance / 100}m of walkway is kept at the walls.`],
    };
  }

  const reservedBounds = reserved.map(rectToBounds);
  const tablesNeeded = Math.ceil(guestCount / seatsPerTable);

  let regions: { bounds: Bounds; side: MechitzaSide }[];
  let partition: (LayoutRect & { kind: 'mechitza' }) | null = null;

  if (mechitza) {
    const clearance = mechitza.clearance ?? DEFAULT_MECHITZA_CLEARANCE;
    const half = clearance / 2;

    // Build the partition FIRST and take the dividing line from it, so the sides the tables are
    // packed into and the line drawn on the canvas are the same number by construction. Reading
    // `mechitza.position` separately let an out-of-range value split the room at one place and
    // draw the mechitza at another — a table on the wrong side of its own partition.
    partition = mechitzaObject(roomWidth, roomLength, mechitza.axis, mechitza.position);

    if (mechitza.axis === 'vertical') {
      const at = partition.x;
      regions = [
        { bounds: { ...usable, maxX: Math.min(usable.maxX, at - half) }, side: 'a' },
        { bounds: { ...usable, minX: Math.max(usable.minX, at + half) }, side: 'b' },
      ];
    } else {
      const at = partition.y;
      regions = [
        { bounds: { ...usable, maxY: Math.min(usable.maxY, at - half) }, side: 'a' },
        { bounds: { ...usable, minY: Math.max(usable.minY, at + half) }, side: 'b' },
      ];
    }

    for (const region of regions) {
      if (boundsWidth(region.bounds) < cellWidth || boundsHeight(region.bounds) < cellHeight) {
        warnings.push('One side of the mechitza is too narrow for a table — move the partition or use smaller tables.');
        break;
      }
    }
  } else {
    regions = [{ bounds: usable, side: null }];
  }

  const tables: PlannedTable[] = [];

  // With a mechitza the two sides are filled evenly rather than one being packed full first: the
  // split is there to seat men and women separately, and an even split is the sane default when
  // nothing yet says how the guest list divides.
  const perRegion = mechitza ? Math.ceil(tablesNeeded / regions.length) : tablesNeeded;

  for (const region of regions) {
    const centres = packRegion(
      region.bounds,
      cellWidth,
      cellHeight,
      footprint.width,
      footprint.height,
      reservedBounds,
      perRegion,
    );
    for (const centre of centres) {
      tables.push({
        kind: tableKind,
        x: centre.x,
        y: centre.y,
        width: defaults.width,
        height: defaults.height,
        capacity: seatsPerTable,
        side: region.side,
      });
    }
  }

  const seatedCapacity = tables.length * seatsPerTable;
  const unplacedGuests = Math.max(0, guestCount - seatedCapacity);

  if (tables.length === 0 && tablesNeeded > 0) {
    // Only when tables were actually WANTED. Nobody on the guest list yet means zero tables for a
    // reason that has nothing to do with the room, and telling a family their hall is too small
    // when they simply have not typed a number is a lie the planner should not tell.
    warnings.push('No tables fit. The room is too small for this table size once walkways are allowed for.');
  } else if (unplacedGuests > 0) {
    warnings.push(
      `${tables.length} tables fit, seating ${seatedCapacity} — ${unplacedGuests} ${unplacedGuests === 1 ? 'guest has' : 'guests have'} nowhere to sit. Try smaller tables, a tighter aisle, or a bigger room.`,
    );
  }

  return { tables, mechitza: partition, seatedCapacity, unplacedGuests, warnings };
}
