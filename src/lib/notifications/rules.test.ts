import { describe, expect, it } from 'vitest';
import {
  combineNotificationRules,
  incompleteGuestDetailsNotifications,
  menuNotFinalNotifications,
  overdueTaskNotifications,
  paymentNotifications,
  rsvpOverdueNotifications,
  seatingIncompleteNotifications,
  vendorMissingDocumentNotifications,
} from './rules';
import type { ExpenseWithPayments, PaymentRow } from '../../data/budget/types';
import type { VendorRow } from '../../data/vendors/types';
import type { GuestWithDetails, HouseholdWithGuests } from '../../data/guests/types';
import type { InvitationEventRow } from '../../data/invitations/types';
import type { SeatingPlanWithObjects } from '../../data/seating/types';
import type { TaskRow } from '../../data/tasks/types';
import type { FunctionRow } from '../../data/event/types';
import type { MenuRow } from '../../data/menus/types';

const NOW = new Date('2026-06-01T12:00:00.000Z');
let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: nextId('payment'),
    event_id: 'evt-1',
    expense_id: 'expense-1',
    amount: 500,
    status: 'scheduled',
    due_date: null,
    paid_at: null,
    method: null,
    reference: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Omit<ExpenseWithPayments, 'payments'>> & { payments?: PaymentRow[] } = {}): ExpenseWithPayments {
  return {
    id: nextId('expense'),
    event_id: 'evt-1',
    vendor_id: null,
    category: 'Catering',
    description: null,
    budgeted: null,
    estimated: null,
    quoted: null,
    agreed: null,
    vat_amount: null,
    due_date: null,
    payment_method: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    payments: [],
    ...overrides,
  };
}

function makeVendor(overrides: Partial<VendorRow> = {}): VendorRow {
  return {
    id: nextId('vendor'),
    event_id: 'evt-1',
    category: 'Catering',
    status: 'booked',
    name: 'The Grove Catering',
    contact_name: null,
    phone: null,
    email: null,
    whatsapp: null,
    website: null,
    address: null,
    quoted_price: null,
    agreed_price: null,
    deposit_amount: null,
    deposit_due_date: null,
    balance_due_date: null,
    vat_registered: false,
    rating: null,
    favourite: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Omit<GuestWithDetails, 'tagIds' | 'functionInvites'>> & { functionInvites?: GuestWithDetails['functionInvites'] } = {}): GuestWithDetails {
  const id = overrides.id ?? nextId('guest');
  return {
    id,
    event_id: 'evt-1',
    household_id: 'house-1',
    first_name: 'Jane',
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tagIds: [],
    functionInvites: [],
    ...overrides,
  };
}

function makeHousehold(overrides: Partial<Omit<HouseholdWithGuests, 'tagIds' | 'guests'>> & { guests?: GuestWithDetails[] } = {}): HouseholdWithGuests {
  return {
    id: nextId('house'),
    event_id: 'evt-1',
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    tagIds: [],
    guests: [],
    ...overrides,
  };
}

function makeInvitationEvent(overrides: Partial<InvitationEventRow> = {}): InvitationEventRow {
  return {
    id: nextId('invevent'),
    event_id: 'evt-1',
    household_id: 'house-1',
    invitation_id: null,
    kind: 'sent',
    channel: 'link',
    meta: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePlan(overrides: Partial<Omit<SeatingPlanWithObjects, 'objects'>> & { objects?: SeatingPlanWithObjects['objects'] } = {}): SeatingPlanWithObjects {
  return {
    id: nextId('plan'),
    event_id: 'evt-1',
    function_id: null,
    name: 'Main room',
    room_width_cm: null,
    room_length_cm: null,
    separate_seating: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    objects: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: nextId('task'),
    event_id: 'evt-1',
    title: 'Book the venue',
    category: null,
    owner_member_id: null,
    due_date: null,
    priority: 'medium',
    status: 'todo',
    vendor_id: null,
    guest_id: null,
    idea_id: null,
    notes: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFunction(overrides: Partial<FunctionRow> = {}): FunctionRow {
  return {
    id: nextId('fn'),
    event_id: 'evt-1',
    name: 'Kiddush',
    kind: 'kiddush',
    starts_at: null,
    ends_at: null,
    location: null,
    dress_code: null,
    hebrew_date_override: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMenu(overrides: Partial<MenuRow> = {}): MenuRow {
  return {
    id: nextId('menu'),
    event_id: 'evt-1',
    function_id: null,
    name: 'Main menu',
    version_label: null,
    is_final: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('paymentNotifications', () => {
  it('flags an overdue scheduled payment as error, and one due soon as warning', () => {
    const overdue = makePayment({ status: 'scheduled', due_date: '2026-05-20', amount: 300 });
    const dueSoon = makePayment({ status: 'scheduled', due_date: '2026-06-05', amount: 150 });
    const expense = makeExpense({ payments: [overdue, dueSoon] });

    const notifications = paymentNotifications([expense], NOW);

    expect(notifications).toHaveLength(2);
    expect(notifications.find((n) => n.key === `payment-overdue:${overdue.id}`)).toMatchObject({ severity: 'error' });
    expect(notifications.find((n) => n.key === `payment-due-soon:${dueSoon.id}`)).toMatchObject({ severity: 'warning' });
  });

  it('ignores a paid payment', () => {
    const paid = makePayment({ status: 'paid', due_date: '2026-01-01' });
    expect(paymentNotifications([makeExpense({ payments: [paid] })], NOW)).toEqual([]);
  });
});

describe('vendorMissingDocumentNotifications', () => {
  it('flags a booked vendor with no linked document', () => {
    const vendor = makeVendor({ status: 'booked' });
    const notifications = vendorMissingDocumentNotifications([vendor], new Set());
    expect(notifications).toEqual([
      expect.objectContaining({ key: `vendor-no-doc:${vendor.id}`, severity: 'warning' }),
    ]);
  });

  it('does not flag a booked vendor that has a document', () => {
    const vendor = makeVendor({ status: 'fully_paid' });
    expect(vendorMissingDocumentNotifications([vendor], new Set([vendor.id]))).toEqual([]);
  });

  it('does not flag a vendor that is not yet booked', () => {
    const vendor = makeVendor({ status: 'shortlisted' });
    expect(vendorMissingDocumentNotifications([vendor], new Set())).toEqual([]);
  });

  it('does not flag "not proceeding" — it is terminal, not "booked or later"', () => {
    const vendor = makeVendor({ status: 'not_proceeding' });
    expect(vendorMissingDocumentNotifications([vendor], new Set())).toEqual([]);
  });
});

describe('rsvpOverdueNotifications', () => {
  it('flags a household sent an invitation over the threshold ago with no completed RSVP', () => {
    const household = makeHousehold();
    const events = [makeInvitationEvent({ household_id: household.id, kind: 'sent', created_at: '2026-05-01T00:00:00.000Z' })];
    const notifications = rsvpOverdueNotifications([household], events, NOW, 21);
    expect(notifications).toEqual([expect.objectContaining({ key: `rsvp-overdue:${household.id}` })]);
  });

  it('does not flag a household that has completed its RSVP', () => {
    const household = makeHousehold();
    const events = [
      makeInvitationEvent({ household_id: household.id, kind: 'sent', created_at: '2026-05-01T00:00:00.000Z' }),
      makeInvitationEvent({ household_id: household.id, kind: 'completed', created_at: '2026-05-02T00:00:00.000Z' }),
    ];
    expect(rsvpOverdueNotifications([household], events, NOW, 21)).toEqual([]);
  });

  it('does not flag a household sent an invitation recently', () => {
    const household = makeHousehold();
    const events = [makeInvitationEvent({ household_id: household.id, kind: 'sent', created_at: '2026-05-29T00:00:00.000Z' })];
    expect(rsvpOverdueNotifications([household], events, NOW, 21)).toEqual([]);
  });

  it('does not flag a household with no invitation sent at all', () => {
    expect(rsvpOverdueNotifications([makeHousehold()], [], NOW, 21)).toEqual([]);
  });
});

describe('incompleteGuestDetailsNotifications', () => {
  it('flags an attending adult with no meal preference', () => {
    const guest = makeGuest({ meal_preference: null, functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });
    const household = makeHousehold({ guests: [guest] });
    expect(incompleteGuestDetailsNotifications([household])).toEqual([
      expect.objectContaining({ key: `guest-missing-meal:${guest.id}` }),
    ]);
  });

  it('does not flag a guest who has not RSVP\'d attending', () => {
    const guest = makeGuest({ meal_preference: null, functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'awaiting', responded_at: null, created_at: '', updated_at: '' }] });
    expect(incompleteGuestDetailsNotifications([makeHousehold({ guests: [guest] })])).toEqual([]);
  });

  it('does not flag a child with no meal preference', () => {
    const guest = makeGuest({ guest_type: 'child', meal_preference: null, functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });
    expect(incompleteGuestDetailsNotifications([makeHousehold({ guests: [guest] })])).toEqual([]);
  });

  it('does not flag an adult who already has a meal preference', () => {
    const guest = makeGuest({ meal_preference: 'vegetarian', functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });
    expect(incompleteGuestDetailsNotifications([makeHousehold({ guests: [guest] })])).toEqual([]);
  });
});

describe('seatingIncompleteNotifications', () => {
  const eventDate = new Date(2026, 5, 15); // 14 days after NOW (1 June)

  it('flags a plan with an unseated attending guest once within the threshold', () => {
    const guest = makeGuest({ functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });
    const household = makeHousehold({ guests: [guest] });
    const plan = makePlan({ function_id: 'fn-1' });
    const notifications = seatingIncompleteNotifications([plan], [household], eventDate, NOW, 30);
    expect(notifications).toEqual([expect.objectContaining({ key: `seating-incomplete:${plan.id}`, severity: 'warning' })]);
  });

  it('escalates to error inside the final week', () => {
    const guest = makeGuest({ functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });
    const household = makeHousehold({ guests: [guest] });
    const plan = makePlan({ function_id: 'fn-1' });
    const soon = new Date(2026, 5, 5); // 4 days after NOW
    const notifications = seatingIncompleteNotifications([plan], [household], soon, NOW, 30);
    expect(notifications[0].severity).toBe('error');
  });

  it('says nothing while the event is beyond the threshold', () => {
    const far = new Date(2026, 11, 1);
    const plan = makePlan();
    expect(seatingIncompleteNotifications([plan], [], far, NOW, 30)).toEqual([]);
  });

  it('says nothing when everyone attending is already seated', () => {
    const plan = makePlan();
    expect(seatingIncompleteNotifications([plan], [], eventDate, NOW, 30)).toEqual([]);
  });
});

describe('overdueTaskNotifications', () => {
  it('flags a task past its due date that is still open', () => {
    const task = makeTask({ due_date: '2026-05-01', status: 'in_progress' });
    expect(overdueTaskNotifications([task], NOW)).toEqual([expect.objectContaining({ key: `task-overdue:${task.id}` })]);
  });

  it('does not flag a done task even if its due date has passed', () => {
    const task = makeTask({ due_date: '2026-05-01', status: 'done' });
    expect(overdueTaskNotifications([task], NOW)).toEqual([]);
  });

  it('does not flag a task due today or in the future', () => {
    const task = makeTask({ due_date: '2026-06-01', status: 'todo' });
    expect(overdueTaskNotifications([task], NOW)).toEqual([]);
  });

  it('does not flag a task with no due date', () => {
    expect(overdueTaskNotifications([makeTask({ due_date: null })], NOW)).toEqual([]);
  });
});

describe('menuNotFinalNotifications', () => {
  const nearEventDate = new Date(2026, 5, 10); // 9 days after NOW

  it('flags a function with no finalised menu, once within the threshold', () => {
    const fn = makeFunction();
    expect(menuNotFinalNotifications([fn], [], nearEventDate, NOW, 30)).toEqual([
      expect.objectContaining({ key: `menu-not-final:${fn.id}`, severity: 'error' }),
    ]);
  });

  it('does not flag a function with a finalised menu of its own', () => {
    const fn = makeFunction();
    const menu = makeMenu({ function_id: fn.id, is_final: true });
    expect(menuNotFinalNotifications([fn], [menu], nearEventDate, NOW, 30)).toEqual([]);
  });

  it('does not count an event-wide final menu towards any one function', () => {
    const fn = makeFunction();
    const eventWideMenu = makeMenu({ function_id: null, is_final: true });
    expect(menuNotFinalNotifications([fn], [eventWideMenu], nearEventDate, NOW, 30)).toEqual([
      expect.objectContaining({ key: `menu-not-final:${fn.id}` }),
    ]);
  });

  it('says nothing while the event is beyond the threshold', () => {
    const far = new Date(2026, 11, 1);
    expect(menuNotFinalNotifications([makeFunction()], [], far, NOW, 30)).toEqual([]);
  });
});

describe('combineNotificationRules', () => {
  it('sorts worst severity first, then by date within a band', () => {
    const overdueExpense = makeExpense({ payments: [makePayment({ status: 'scheduled', due_date: '2026-05-01' })] });
    const laterOverdueExpense = makeExpense({ payments: [makePayment({ status: 'scheduled', due_date: '2026-05-20' })] });
    const infoGuest = makeGuest({ meal_preference: null, functionInvites: [{ id: 'inv-1', event_id: 'evt-1', guest_id: 'g', function_id: 'fn-1', invited: true, rsvp: 'attending', responded_at: null, created_at: '', updated_at: '' }] });

    const result = combineNotificationRules({
      expenses: [overdueExpense, laterOverdueExpense],
      vendors: [],
      vendorIdsWithDocuments: new Set(),
      households: [makeHousehold({ guests: [infoGuest] })],
      invitationEvents: [],
      seatingPlans: [],
      tasks: [],
      functions: [],
      menus: [],
      eventDate: new Date(2027, 0, 1),
      now: NOW,
    });

    expect(result.map((n) => n.severity)).toEqual(['error', 'error', 'info']);
    // Within the 'error' band, the earlier due date sorts first.
    expect(result[0].message).toContain('1 May');
    expect(result[1].message).toContain('20 May');
  });

  it('returns [] when nothing is due, overdue, missing or incomplete', () => {
    const result = combineNotificationRules({
      expenses: [],
      vendors: [],
      vendorIdsWithDocuments: new Set(),
      households: [],
      invitationEvents: [],
      seatingPlans: [],
      tasks: [],
      functions: [],
      menus: [],
      eventDate: new Date(2027, 0, 1),
      now: NOW,
    });
    expect(result).toEqual([]);
  });
});
