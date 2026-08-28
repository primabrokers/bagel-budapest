import { describe, expect, it } from 'vitest';
import { rsvpStats } from './rsvpStats';
import type { GuestFunctionInviteRow, GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

function makeInvite(overrides: Partial<GuestFunctionInviteRow> & { function_id: string }): GuestFunctionInviteRow {
  return {
    id: nextId(),
    event_id: 'event-1',
    guest_id: 'guest-1',
    invited: true,
    rsvp: 'awaiting',
    responded_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<GuestWithDetails> = {}): GuestWithDetails {
  return {
    id: nextId(),
    event_id: 'event-1',
    household_id: 'household-1',
    first_name: 'Sarah',
    last_name: 'Cohen',
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tagIds: [],
    functionInvites: [],
    ...overrides,
  };
}

function makeHousehold(guests: GuestWithDetails[], overrides: Partial<HouseholdWithGuests> = {}): HouseholdWithGuests {
  return {
    id: nextId(),
    event_id: 'event-1',
    name: 'The Cohen Family',
    main_contact_name: null,
    address_lines: null,
    postcode: null,
    email: null,
    phone: null,
    whatsapp: null,
    category: null,
    side_of_family: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
    tagIds: [],
    guests,
    ...overrides,
  };
}

describe('rsvpStats', () => {
  it('returns all-zero stats for no households', () => {
    expect(rsvpStats([])).toEqual({
      invited: 0,
      attending: 0,
      declined: 0,
      awaiting: 0,
      unsure: 0,
      adults: 0,
      children: 0,
      byFunction: {},
    });
  });

  it('counts adults and children regardless of any invite', () => {
    const households = [
      makeHousehold([makeGuest({ guest_type: 'adult' }), makeGuest({ guest_type: 'child' }), makeGuest({ guest_type: 'child' })]),
    ];
    const stats = rsvpStats(households);
    expect(stats.adults).toBe(1);
    expect(stats.children).toBe(2);
  });

  it('buckets invited guests by rsvp status, summed across all functions', () => {
    const households = [
      makeHousehold([
        makeGuest({
          functionInvites: [
            makeInvite({ function_id: 'fn-1', rsvp: 'attending' }),
            makeInvite({ function_id: 'fn-2', rsvp: 'declined' }),
          ],
        }),
        makeGuest({
          functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'awaiting' })],
        }),
      ]),
    ];
    const stats = rsvpStats(households);
    expect(stats.invited).toBe(3);
    expect(stats.attending).toBe(1);
    expect(stats.declined).toBe(1);
    expect(stats.awaiting).toBe(1);
    expect(stats.unsure).toBe(0);
  });

  it('excludes invites where invited is false', () => {
    const households = [
      makeHousehold([
        makeGuest({
          functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'attending', invited: false })],
        }),
      ]),
    ];
    const stats = rsvpStats(households);
    expect(stats.invited).toBe(0);
    expect(stats.attending).toBe(0);
  });

  it('breaks down the same four buckets per function id', () => {
    const households = [
      makeHousehold([
        makeGuest({
          functionInvites: [
            makeInvite({ function_id: 'fn-1', rsvp: 'attending' }),
            makeInvite({ function_id: 'fn-2', rsvp: 'unsure' }),
          ],
        }),
        makeGuest({
          functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'declined' })],
        }),
      ]),
    ];
    const stats = rsvpStats(households);
    expect(stats.byFunction['fn-1']).toEqual({ attending: 1, declined: 1, awaiting: 0, unsure: 0 });
    expect(stats.byFunction['fn-2']).toEqual({ attending: 0, declined: 0, awaiting: 0, unsure: 1 });
  });

  it('sums the per-function buckets to the same totals as the overall counts', () => {
    const households = [
      makeHousehold([
        makeGuest({
          functionInvites: [
            makeInvite({ function_id: 'fn-1', rsvp: 'attending' }),
            makeInvite({ function_id: 'fn-2', rsvp: 'attending' }),
            makeInvite({ function_id: 'fn-2', rsvp: 'declined' }),
          ],
        }),
      ]),
      makeHousehold([
        makeGuest({
          functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'unsure' })],
        }),
      ]),
    ];
    const stats = rsvpStats(households);
    const summed = Object.values(stats.byFunction).reduce(
      (acc, bucket) => ({
        attending: acc.attending + bucket.attending,
        declined: acc.declined + bucket.declined,
        awaiting: acc.awaiting + bucket.awaiting,
        unsure: acc.unsure + bucket.unsure,
      }),
      { attending: 0, declined: 0, awaiting: 0, unsure: 0 },
    );
    expect(summed).toEqual({
      attending: stats.attending,
      declined: stats.declined,
      awaiting: stats.awaiting,
      unsure: stats.unsure,
    });
  });

  it('aggregates across multiple households', () => {
    const households = [
      makeHousehold([makeGuest({ functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'attending' })] })]),
      makeHousehold([makeGuest({ functionInvites: [makeInvite({ function_id: 'fn-1', rsvp: 'attending' })] })]),
    ];
    expect(rsvpStats(households).attending).toBe(2);
  });
});
