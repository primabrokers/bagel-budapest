import { describe, expect, it } from 'vitest';
import { attendingGuestsForFunction, cateringSummary } from './cateringSummary';
import type {
  GuestFunctionInviteRow,
  GuestWithDetails,
  HouseholdWithGuests,
} from '../../data/guests/types';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeInvite(overrides: Partial<GuestFunctionInviteRow> = {}): GuestFunctionInviteRow {
  return {
    id: nextId('invite'),
    event_id: 'evt-1',
    guest_id: 'guest-1',
    function_id: 'func-friday',
    invited: true,
    rsvp: 'attending',
    responded_at: '2026-06-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Omit<GuestWithDetails, 'functionInvites' | 'tagIds'>> & {
  functionInvites?: GuestFunctionInviteRow[];
  tagIds?: string[];
} = {}): GuestWithDetails {
  const id = overrides.id ?? nextId('guest');
  return {
    id,
    event_id: 'evt-1',
    household_id: 'house-1',
    first_name: 'Jane',
    last_name: 'Doe',
    guest_type: 'adult',
    age: null,
    gender: null,
    dietary: null,
    allergies: null,
    meal_preference: null,
    child_meal: false,
    high_chair: false,
    baby_seat: false,
    accessibility: null,
    relationship: null,
    is_vip: false,
    notes: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tagIds: [],
    functionInvites: [makeInvite({ guest_id: id })],
    ...overrides,
  };
}

function makeHousehold(guests: GuestWithDetails[], overrides: Partial<Omit<HouseholdWithGuests, 'guests' | 'tagIds'>> = {}): HouseholdWithGuests {
  return {
    id: nextId('house'),
    event_id: 'evt-1',
    name: 'Doe family',
    main_contact_name: null,
    address_lines: null,
    postcode: null,
    email: null,
    phone: null,
    whatsapp: null,
    category: null,
    side_of_family: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    tagIds: [],
    guests,
    ...overrides,
  };
}

const FUNCTION_ID = 'func-friday';
const OTHER_FUNCTION_ID = 'func-sunday';

describe('attendingGuestsForFunction', () => {
  it('counts a guest only when invited AND rsvp is attending', () => {
    const attending = makeGuest({ functionInvites: [makeInvite({ invited: true, rsvp: 'attending' })] });
    const declined = makeGuest({ functionInvites: [makeInvite({ invited: true, rsvp: 'declined' })] });
    const awaiting = makeGuest({ functionInvites: [makeInvite({ invited: true, rsvp: 'awaiting' })] });
    // A data-integrity edge case: rsvp says attending but invited is false. Must not count —
    // "invited" is the gate, not a formality.
    const notInvitedButMarkedAttending = makeGuest({
      functionInvites: [makeInvite({ invited: false, rsvp: 'attending' })],
    });
    const households = [makeHousehold([attending, declined, awaiting, notInvitedButMarkedAttending])];

    const result = attendingGuestsForFunction(households, FUNCTION_ID);

    expect(result.map((g) => g.id)).toEqual([attending.id]);
  });

  it('only counts invites for the requested function, not a guest\'s other functions', () => {
    const guest = makeGuest({
      functionInvites: [
        makeInvite({ function_id: FUNCTION_ID, rsvp: 'declined' }),
        makeInvite({ function_id: OTHER_FUNCTION_ID, rsvp: 'attending' }),
      ],
    });
    const households = [makeHousehold([guest])];

    expect(attendingGuestsForFunction(households, FUNCTION_ID)).toHaveLength(0);
    expect(attendingGuestsForFunction(households, OTHER_FUNCTION_ID)).toHaveLength(1);
  });
});

describe('cateringSummary', () => {
  it('splits attending guests into adults and children', () => {
    const adult = makeGuest({ guest_type: 'adult' });
    const child = makeGuest({ guest_type: 'child' });
    const households = [makeHousehold([adult, child])];

    const summary = cateringSummary(households, FUNCTION_ID);

    expect(summary.adults).toBe(1);
    expect(summary.children).toBe(1);
    expect(summary.attending).toBe(2);
  });

  it('counts child_meal and high_chair independently of guest_type', () => {
    // An older child eating the adult menu: guest_type 'child', child_meal false.
    const teen = makeGuest({ guest_type: 'child', child_meal: false });
    // A toddler who needs both a kids' meal and a high chair.
    const toddler = makeGuest({ guest_type: 'child', child_meal: true, high_chair: true });
    const households = [makeHousehold([teen, toddler])];

    const summary = cateringSummary(households, FUNCTION_ID);

    expect(summary.children).toBe(2);
    expect(summary.childMealCount).toBe(1);
    expect(summary.highChairCount).toBe(1);
  });

  it('buckets by meal_preference, defaulting an unset preference to standard', () => {
    const vegetarian = makeGuest({ meal_preference: 'vegetarian' });
    const vegan = makeGuest({ meal_preference: 'vegan' });
    const glutenFree = makeGuest({ meal_preference: 'gluten_free' });
    const other = makeGuest({ meal_preference: 'other' });
    const unset = makeGuest({ meal_preference: null });
    const households = [makeHousehold([vegetarian, vegan, glutenFree, other, unset])];

    const summary = cateringSummary(households, FUNCTION_ID);

    expect(summary.byMealPreference).toEqual({
      standard: 1,
      vegetarian: 1,
      vegan: 1,
      gluten_free: 1,
      other: 1,
    });
  });

  it('builds an allergy roster of attending guests with a non-empty allergies field, sorted by name', () => {
    const zoe = makeGuest({ first_name: 'Zoe', last_name: 'Adler', allergies: 'Peanuts' });
    const amir = makeGuest({ first_name: 'Amir', last_name: 'Berkowitz', allergies: 'Shellfish' });
    // Whitespace-only allergies text is treated the same as none.
    const blank = makeGuest({ first_name: 'Sam', allergies: '   ' });
    const none = makeGuest({ first_name: 'Lee', allergies: null });
    const households = [makeHousehold([zoe, amir, blank, none])];

    const summary = cateringSummary(households, FUNCTION_ID);

    expect(summary.allergyRoster).toEqual([
      { guestId: amir.id, name: 'Amir Berkowitz', allergies: 'Shellfish' },
      { guestId: zoe.id, name: 'Zoe Adler', allergies: 'Peanuts' },
    ]);
  });

  it('excludes guests declining, awaiting, or not invited to this function', () => {
    const declined = makeGuest({ functionInvites: [makeInvite({ rsvp: 'declined' })] });
    const awaiting = makeGuest({ functionInvites: [makeInvite({ rsvp: 'awaiting' })] });
    const unsure = makeGuest({ functionInvites: [makeInvite({ rsvp: 'unsure' })] });
    const notInvited = makeGuest({ functionInvites: [makeInvite({ invited: false, rsvp: 'awaiting' })] });
    const households = [makeHousehold([declined, awaiting, unsure, notInvited])];

    const summary = cateringSummary(households, FUNCTION_ID);

    expect(summary.attending).toBe(0);
    expect(summary.allergyRoster).toEqual([]);
  });

  it('spans multiple households', () => {
    const householdA = makeHousehold([makeGuest()], { name: 'A family' });
    const householdB = makeHousehold([makeGuest(), makeGuest()], { name: 'B family' });

    const summary = cateringSummary([householdA, householdB], FUNCTION_ID);

    expect(summary.attending).toBe(3);
  });
});
