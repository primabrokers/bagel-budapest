import type { ScheduleAudience } from '../../data/schedule/types';

/** Display order for `bm_schedule_items.audience`, matching the DB check constraint (migration
 *  6) — also the order the `RunSheetPage` filter and `ScheduleItemSheet`'s `Select` list them
 *  in. */
export const AUDIENCES: ScheduleAudience[] = ['all', 'organisers', 'vendors', 'family'];

export const AUDIENCE_LABELS: Record<ScheduleAudience, string> = {
  all: 'Everyone',
  organisers: 'Organisers',
  vendors: 'Vendors',
  family: 'Family',
};

export const AUDIENCE_BADGE: Record<ScheduleAudience, 'muted' | 'plum' | 'gold' | 'info'> = {
  all: 'muted',
  organisers: 'plum',
  vendors: 'gold',
  family: 'info',
};
