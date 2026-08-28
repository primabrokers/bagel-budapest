import type { IdeaStatus } from '../../data/ideas/types';

/** Display order for `bm_ideas.status`, matching the DB check constraint's own progression
 *  (migration 6) — also the order the status `Menu` and desktop status lanes list them in. */
export const IDEA_STATUSES: IdeaStatus[] = ['inspiration', 'considering', 'shortlisted', 'approved', 'purchased', 'rejected'];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  inspiration: 'Inspiration',
  considering: 'Considering',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  purchased: 'Purchased',
  rejected: 'Rejected',
};

export const IDEA_STATUS_BADGE: Record<IdeaStatus, 'muted' | 'info' | 'plum' | 'gold' | 'success' | 'danger'> = {
  inspiration: 'muted',
  considering: 'info',
  shortlisted: 'plum',
  approved: 'gold',
  purchased: 'success',
  rejected: 'danger',
};
