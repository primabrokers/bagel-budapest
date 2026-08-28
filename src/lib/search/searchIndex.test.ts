import { describe, expect, it } from 'vitest';
import { buildSearchIndex } from './searchIndex';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { VendorRow } from '../../data/vendors/types';
import type { TaskRow } from '../../data/tasks/types';
import type { BoardWithIdeas } from '../../data/ideas/types';
import type { NoteRow } from '../../data/notes/types';
import type { DocumentRow } from '../../data/documents/types';
import type { CustomContactRow } from '../../data/contacts/types';

const NOW = '2026-01-01T00:00:00.000Z';

function makeHousehold(overrides: Partial<Omit<HouseholdWithGuests, 'guests'>> & { guests?: HouseholdWithGuests['guests'] } = {}): HouseholdWithGuests {
  return {
    id: 'house-1',
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
    created_at: NOW,
    updated_at: NOW,
    created_by: null,
    tagIds: [],
    guests: [],
    ...overrides,
  };
}

function makeGuest(overrides: Partial<HouseholdWithGuests['guests'][number]> = {}): HouseholdWithGuests['guests'][number] {
  return {
    id: 'guest-1',
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
    created_at: NOW,
    updated_at: NOW,
    tagIds: [],
    functionInvites: [],
    ...overrides,
  };
}

function makeVendor(overrides: Partial<VendorRow> = {}): VendorRow {
  return {
    id: 'vendor-1',
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
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    event_id: 'evt-1',
    title: 'Book the venue',
    category: null,
    owner_member_id: null,
    due_date: '2026-03-01',
    priority: 'medium',
    status: 'todo',
    vendor_id: null,
    guest_id: null,
    idea_id: null,
    notes: null,
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeBoard(overrides: Partial<Omit<BoardWithIdeas, 'ideas'>> & { ideas?: BoardWithIdeas['ideas'] } = {}): BoardWithIdeas {
  return {
    id: 'board-1',
    event_id: 'evt-1',
    name: 'Decor',
    sort_order: 0,
    created_at: NOW,
    updated_at: NOW,
    ideas: [],
    ...overrides,
  };
}

function makeIdea(overrides: Partial<BoardWithIdeas['ideas'][number]> = {}): BoardWithIdeas['ideas'][number] {
  return {
    id: 'idea-1',
    event_id: 'evt-1',
    board_id: 'board-1',
    title: 'Gold balloon arch',
    description: null,
    image_path: null,
    source_url: null,
    cost_estimate: null,
    vendor_id: null,
    status: 'inspiration',
    tags: [],
    notes: null,
    sort_order: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    event_id: 'evt-1',
    title: null,
    body: 'Remember to confirm numbers with the caterer by March.',
    pinned: false,
    tags: [],
    entity_type: null,
    entity_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    event_id: 'evt-1',
    folder: 'Contracts',
    name: 'Venue contract.pdf',
    storage_path: 'evt-1/doc.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    notes: null,
    uploaded_by: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeContact(overrides: Partial<CustomContactRow> = {}): CustomContactRow {
  return {
    id: 'contact-1',
    event_id: 'evt-1',
    name: 'Rabbi Weiss',
    role: 'Rabbi',
    phone: null,
    email: null,
    whatsapp: null,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('buildSearchIndex', () => {
  it('indexes households and their guests, with the guest carrying its household as subtitle', () => {
    const household = makeHousehold({ guests: [makeGuest()] });
    const index = buildSearchIndex({ households: [household] });

    const householdResult = index.find((r) => r.type === 'household');
    const guestResult = index.find((r) => r.type === 'guest');

    expect(householdResult).toMatchObject({ id: 'house-1', title: 'The Cohen Family', path: '/guests' });
    expect(guestResult).toMatchObject({ id: 'guest-1', title: 'Jane Cohen', subtitle: 'The Cohen Family', path: '/guests' });
  });

  it('says "No guests yet" for an empty household', () => {
    const index = buildSearchIndex({ households: [makeHousehold({ guests: [] })] });
    expect(index[0].subtitle).toBe('No guests yet');
  });

  it('indexes vendors with category and a humanized status', () => {
    const index = buildSearchIndex({ vendors: [makeVendor({ status: 'quote_received' })] });
    expect(index[0]).toMatchObject({ type: 'vendor', title: 'The Grove Catering', subtitle: 'Catering · Quote received', path: '/vendors' });
  });

  it('indexes tasks with due date and status', () => {
    const index = buildSearchIndex({ tasks: [makeTask({ due_date: null, status: 'in_progress' })] });
    expect(index[0].subtitle).toBe('No due date · In progress');
  });

  it('indexes ideas nested under their boards', () => {
    const index = buildSearchIndex({ ideaBoards: [makeBoard({ ideas: [makeIdea()] })] });
    expect(index[0]).toMatchObject({ type: 'idea', title: 'Gold balloon arch', subtitle: 'Decor · Inspiration', path: '/ideas' });
  });

  it('falls back to a snippet of the body for a title-less note', () => {
    const index = buildSearchIndex({ notes: [makeNote({ title: null, body: '# Caterer notes\nConfirm numbers' })] });
    expect(index[0].title).toBe('Caterer notes');
  });

  it('uses the note title when present', () => {
    const index = buildSearchIndex({ notes: [makeNote({ title: 'Caterer follow-up' })] });
    expect(index[0].title).toBe('Caterer follow-up');
  });

  it('indexes documents with their folder, or "Unfiled"', () => {
    const index = buildSearchIndex({ documents: [makeDocument({ folder: null })] });
    expect(index[0].subtitle).toBe('Unfiled');
  });

  it('indexes custom contacts with their role', () => {
    const index = buildSearchIndex({ contacts: [makeContact()] });
    expect(index[0]).toMatchObject({ type: 'contact', title: 'Rabbi Weiss', subtitle: 'Rabbi', path: '/contacts' });
  });

  it('returns nothing for domains that are omitted entirely', () => {
    expect(buildSearchIndex({})).toEqual([]);
  });
});
