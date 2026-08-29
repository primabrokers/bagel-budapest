import { isSeatableKind } from './tableGeometry';
import { isGuestRelevantToPlan } from './warnings';
import type { GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';
import type {
  FloorObjectRow,
  SeatAssignmentRow,
  SeatingPlanRow,
  SeatingPreferenceRow,
} from '../../data/seating/types';

/**
 * Fills a seating plan automatically: who sits at which table.
 *
 * Deliberately a deterministic solver rather than a language model. The inputs are already
 * structured — households, `must_together` / `prefer_together` / `keep_apart`, table capacities,
 * and which side of a mechitza a table stands on — so this is a constraint problem, and a
 * constraint solver is reproducible, instant, free, and testable. Running the same plan twice
 * gives the same answer, which matters when a family is arguing about where an uncle sits.
 *
 * The hard constraints are satisfied BY CONSTRUCTION, never by scoring afterwards:
 *   - a table never goes over capacity
 *   - `must_together` guests always share a table (they are merged into one atom before placing)
 *   - `keep_apart` guests never share a table (checked before each placement)
 *   - with separate seating, a table's mechitza side is respected
 *
 * Everything else — household cohesion, `prefer_together`, keeping children near a parent — is a
 * preference expressed through table scoring, so a crowded room degrades gracefully instead of
 * failing.
 *
 * Guests it cannot place are RETURNED as unseated rather than squeezed in. See `roomLayout.ts`
 * for the same principle applied to the room itself.
 */

export interface AutoSeatInput {
  plan: SeatingPlanRow;
  households: HouseholdWithGuests[];
  /** Every floor object in the plan — tables, and the mechitza if there is one. */
  objects: FloorObjectRow[];
  preferences: SeatingPreferenceRow[];
  /** Existing assignments. Locked ones are kept exactly as they are. */
  existing: SeatAssignmentRow[];
  /**
   * Seat men and women on opposite sides of the mechitza. Comes from
   * `bm_seating_plans.separate_seating` — a stored family choice, never inferred from the mere
   * presence of a partition, because plenty of families put a mechitza up for davening and seat
   * the meal together.
   */
  separateSeating?: boolean;
}

export interface AutoSeatAssignment {
  guestId: string;
  objectId: string;
}

export interface AutoSeatResult {
  /** The complete proposed plan, including the locked assignments carried through unchanged. */
  assignments: AutoSeatAssignment[];
  /** Guests with no table. Non-empty means there was genuinely nowhere to put them. */
  unseated: string[];
  warnings: string[];
}

type Side = 'a' | 'b';

/**
 * Union-find over `must_together`, so a chain (A with B, B with C) becomes one atom of three
 * rather than three pairwise decisions that can contradict each other.
 */
function buildMustClusters(guestIds: string[], preferences: SeatingPreferenceRow[]): Map<string, string> {
  const parent = new Map<string, string>();
  for (const id of guestIds) parent.set(id, id);

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    // Path compression, so a long must-chain does not degrade later lookups.
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  for (const pref of preferences) {
    if (pref.rule !== 'must_together') continue;
    if (!parent.has(pref.guest_a) || !parent.has(pref.guest_b)) continue;
    const rootA = find(pref.guest_a);
    const rootB = find(pref.guest_b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const clusters = new Map<string, string>();
  for (const id of guestIds) clusters.set(id, find(id));
  return clusters;
}

/**
 * Which side of the mechitza each table stands on. A tall thin partition divides the room
 * left/right; a wide flat one divides it top/bottom.
 */
function tableSides(objects: FloorObjectRow[]): Map<string, Side> | null {
  const mechitza = objects.find((o) => o.kind === 'mechitza');
  if (!mechitza) return null;

  const dividesLeftRight = mechitza.height >= mechitza.width;
  const sides = new Map<string, Side>();

  for (const object of objects) {
    if (!isSeatableKind(object.kind)) continue;
    const onFirstSide = dividesLeftRight ? object.x < mechitza.x : object.y < mechitza.y;
    sides.set(object.id, onFirstSide ? 'a' : 'b');
  }

  return sides;
}

/**
 * The side a guest must sit on under separate seating, or `null` for no constraint.
 *
 * Men to side 'a', women to side 'b' — the labels are geometric, not a statement about which side
 * of a room is whose, and a family flips it by moving the partition. A guest with no gender
 * recorded is left unconstrained rather than guessed at: an unknown is a gap in the guest list,
 * and inventing an answer would seat someone wrongly with confidence.
 */
function requiredSide(guest: GuestWithDetails): Side | null {
  const gender = guest.gender?.trim().toLowerCase();
  if (gender === 'male') return 'a';
  if (gender === 'female') return 'b';
  return null;
}

interface Atom {
  guests: GuestWithDetails[];
  householdId: string;
  side: Side | null;
}

export function autoSeat(input: AutoSeatInput): AutoSeatResult {
  const { plan, households, objects, preferences, existing, separateSeating = false } = input;
  const warnings: string[] = [];

  const sides = tableSides(objects);
  const useSides = separateSeating && sides !== null;
  if (separateSeating && !sides) {
    warnings.push('Separate seating is on for this plan, but there is no mechitza to seat either side of.');
  }

  const tables = objects.filter((o) => isSeatableKind(o.kind));
  const guestsById = new Map<string, GuestWithDetails>();
  const householdOf = new Map<string, string>();
  for (const household of households) {
    for (const guest of household.guests) {
      guestsById.set(guest.id, guest);
      householdOf.set(guest.id, household.id);
    }
  }

  // Only guests this plan is actually about — attending the function it covers.
  const relevant = [...guestsById.values()].filter((g) => isGuestRelevantToPlan(g, plan));
  const relevantIds = relevant.map((g) => g.id);

  // Locked assignments are immovable and seed the occupancy counts.
  const lockedByGuest = new Map<string, string>();
  const occupancy = new Map<string, GuestWithDetails[]>();
  for (const table of tables) occupancy.set(table.id, []);

  for (const assignment of existing) {
    if (!assignment.locked) continue;
    const guest = guestsById.get(assignment.guest_id);
    const seat = occupancy.get(assignment.object_id);
    if (!guest || !seat) continue;
    lockedByGuest.set(guest.id, assignment.object_id);
    seat.push(guest);
  }

  const keepApart = new Map<string, Set<string>>();
  for (const pref of preferences) {
    if (pref.rule !== 'keep_apart') continue;
    if (!keepApart.has(pref.guest_a)) keepApart.set(pref.guest_a, new Set());
    if (!keepApart.has(pref.guest_b)) keepApart.set(pref.guest_b, new Set());
    keepApart.get(pref.guest_a)?.add(pref.guest_b);
    keepApart.get(pref.guest_b)?.add(pref.guest_a);
  }

  const preferTogether = new Map<string, Set<string>>();
  for (const pref of preferences) {
    if (pref.rule !== 'prefer_together') continue;
    if (!preferTogether.has(pref.guest_a)) preferTogether.set(pref.guest_a, new Set());
    if (!preferTogether.has(pref.guest_b)) preferTogether.set(pref.guest_b, new Set());
    preferTogether.get(pref.guest_a)?.add(pref.guest_b);
    preferTogether.get(pref.guest_b)?.add(pref.guest_a);
  }

  // Build atoms: a must_together cluster is placed as one unit, otherwise a guest is their own.
  const clusterRoots = buildMustClusters(relevantIds, preferences);
  const atomsByRoot = new Map<string, GuestWithDetails[]>();
  for (const guest of relevant) {
    if (lockedByGuest.has(guest.id)) continue;
    const root = clusterRoots.get(guest.id) ?? guest.id;
    const bucket = atomsByRoot.get(root) ?? [];
    bucket.push(guest);
    atomsByRoot.set(root, bucket);
  }

  const atoms: Atom[] = [];
  for (const guests of atomsByRoot.values()) {
    let side: Side | null = null;
    if (useSides) {
      const required = new Set(guests.map(requiredSide).filter((s): s is Side => s !== null));
      if (required.size > 1) {
        // An explicit "these two must sit together" beats a side inferred from gender: the family
        // typed the former and only implied the latter. Keep them together and say so.
        warnings.push(
          'Some guests who must sit together are of different genders, so they have been kept together rather than split across the mechitza.',
        );
      } else {
        side = [...required][0] ?? null;
      }
    }
    atoms.push({ guests, householdId: householdOf.get(guests[0].id) ?? '', side });
  }

  // Largest atoms first: a table of eight has to be found for a family of six before the singles
  // fill the room and leave only scattered seats.
  atoms.sort((a, b) => b.guests.length - a.guests.length);

  const assignments: AutoSeatAssignment[] = [...lockedByGuest.entries()].map(([guestId, objectId]) => ({
    guestId,
    objectId,
  }));
  const unseated: string[] = [];

  for (const atom of atoms) {
    let bestTable: FloorObjectRow | null = null;
    let bestScore = -Infinity;

    for (const table of tables) {
      const seated = occupancy.get(table.id) ?? [];
      const capacity = table.capacity ?? 0;

      // --- hard constraints ---
      if (capacity - seated.length < atom.guests.length) continue;
      if (useSides && atom.side && sides?.get(table.id) !== atom.side) continue;

      const conflicts = atom.guests.some((guest) =>
        seated.some((other) => keepApart.get(guest.id)?.has(other.id)),
      );
      if (conflicts) continue;

      // --- preferences, as a score ---
      let score = 0;
      for (const guest of atom.guests) {
        for (const other of seated) {
          if (preferTogether.get(guest.id)?.has(other.id)) score += 10;
          if (householdOf.get(other.id) === atom.householdId) score += 4;
        }
      }
      // Prefer a table that the atom nearly fills — it leaves fewer awkward single seats behind
      // and keeps a household from being split across two half-empty tables.
      const leftover = capacity - seated.length - atom.guests.length;
      score -= leftover;

      if (score > bestScore) {
        bestScore = score;
        bestTable = table;
      }
    }

    if (!bestTable) {
      unseated.push(...atom.guests.map((g) => g.id));
      continue;
    }

    const seated = occupancy.get(bestTable.id) ?? [];
    for (const guest of atom.guests) {
      seated.push(guest);
      assignments.push({ guestId: guest.id, objectId: bestTable.id });
    }
    occupancy.set(bestTable.id, seated);
  }

  if (unseated.length > 0) {
    warnings.push(
      `${unseated.length} ${unseated.length === 1 ? 'guest' : 'guests'} could not be seated — there is not enough table space, or their seating rules cannot all be met at once.`,
    );
  }

  return { assignments, unseated, warnings };
}
