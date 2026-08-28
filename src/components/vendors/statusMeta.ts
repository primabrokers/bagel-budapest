import type { VendorStatus } from '../../data/vendors/types';

/** Display order for `bm_vendors.status` — matches the DB check constraint's own natural
 *  progression (migration 5), which is also the order `VendorsPage`'s status board renders its
 *  columns in. */
export const VENDOR_STATUSES: VendorStatus[] = [
  'researching',
  'contacted',
  'quote_received',
  'shortlisted',
  'booked',
  'fully_paid',
  'not_proceeding',
];

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  researching: 'Researching',
  contacted: 'Contacted',
  quote_received: 'Quote received',
  shortlisted: 'Shortlisted',
  booked: 'Booked',
  fully_paid: 'Fully paid',
  not_proceeding: 'Not proceeding',
};

export const VENDOR_STATUS_BADGE: Record<VendorStatus, 'muted' | 'info' | 'plum' | 'gold' | 'success' | 'danger'> = {
  researching: 'muted',
  contacted: 'info',
  quote_received: 'plum',
  shortlisted: 'gold',
  booked: 'success',
  fully_paid: 'success',
  not_proceeding: 'danger',
};
