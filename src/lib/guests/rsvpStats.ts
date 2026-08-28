import type { HouseholdWithGuests } from '../../data/guests/types';

export interface RsvpBuckets {
  attending: number;
  declined: number;
  awaiting: number;
  unsure: number;
}

export interface RsvpStats {
  /** Summed over every guest's own function-invite rows, counting only invites where
   *  `invited === true` — a guest invited to two functions counts twice, once per invite, which
   *  is exactly what makes the four totals below equal the sum of `byFunction`'s buckets. */
  invited: number;
  attending: number;
  declined: number;
  awaiting: number;
  unsure: number;
  adults: number;
  children: number;
  /** Same four buckets, one entry per function id, counting only that function's invites. */
  byFunction: Record<string, RsvpBuckets>;
}

function emptyBuckets(): RsvpBuckets {
  return { attending: 0, declined: 0, awaiting: 0, unsure: 0 };
}

/**
 * Pure aggregation over the guest book for the RSVP dashboard widget and the Guests screen's
 * filter counts — reads the `bm_guest_function_invites` rows already embedded on each guest by
 * `useGuestBook()`, no extra query.
 */
export function rsvpStats(households: HouseholdWithGuests[]): RsvpStats {
  const stats: RsvpStats = {
    invited: 0,
    attending: 0,
    declined: 0,
    awaiting: 0,
    unsure: 0,
    adults: 0,
    children: 0,
    byFunction: {},
  };

  for (const household of households) {
    for (const guest of household.guests) {
      if (guest.guest_type === 'adult') stats.adults += 1;
      else stats.children += 1;

      for (const invite of guest.functionInvites) {
        if (!invite.invited) continue;

        stats.invited += 1;
        stats[invite.rsvp] += 1;

        const bucket = stats.byFunction[invite.function_id] ?? emptyBuckets();
        bucket[invite.rsvp] += 1;
        stats.byFunction[invite.function_id] = bucket;
      }
    }
  }

  return stats;
}
