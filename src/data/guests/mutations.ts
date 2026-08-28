import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type {
  GuestRow,
  GuestType,
  HouseholdRow,
  MealPreference,
  RsvpStatus,
  SideOfFamily,
  TagRow,
} from './types';

function guestLabel(g: { first_name: string; last_name?: string | null }): string {
  return [g.first_name, g.last_name].filter(Boolean).join(' ');
}

function pluralGuests(n: number): string {
  return `${n} guest${n === 1 ? '' : 's'}`;
}

/* -------------------------------------------------------------------------------------------
   Households
------------------------------------------------------------------------------------------- */

export interface NewHouseholdInput {
  name: string;
  main_contact_name?: string | null;
  address_lines?: string | null;
  postcode?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  category?: string | null;
  side_of_family?: SideOfFamily | null;
  notes?: string | null;
}

export async function createHousehold(eventId: string, input: NewHouseholdInput): Promise<HouseholdRow> {
  const { data, error } = await supabase
    .from('bm_households')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as HouseholdRow;
  await logActivity({
    eventId,
    action: 'household_created',
    entityType: 'household',
    entityId: row.id,
    summary: `Added household: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateHousehold(id: string, patch: Partial<HouseholdRow>): Promise<HouseholdRow> {
  const { data, error } = await supabase.from('bm_households').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as HouseholdRow;
  await logActivity({
    eventId: row.event_id,
    action: 'household_updated',
    entityType: 'household',
    entityId: row.id,
    summary: `Updated household: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. Cascades to the
 *  household's own guests via the FK (migration 2's `on delete cascade`). */
export async function deleteHousehold(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_households')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_households').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as HouseholdRow;
    await logActivity({
      eventId: row.event_id,
      action: 'household_deleted',
      entityType: 'household',
      entityId: id,
      summary: `Removed household: ${row.name}`,
      before: row,
    });
  }
}

/* -------------------------------------------------------------------------------------------
   Guests
------------------------------------------------------------------------------------------- */

export interface NewGuestInput {
  first_name: string;
  last_name?: string | null;
  guest_type: GuestType;
  age?: number | null;
  gender?: string | null;
  dietary?: string | null;
  allergies?: string | null;
  meal_preference?: MealPreference | null;
  child_meal?: boolean;
  high_chair?: boolean;
  baby_seat?: boolean;
  accessibility?: string | null;
  relationship?: string | null;
  is_vip?: boolean;
  notes?: string | null;
  sort_order?: number;
}

export async function createGuest(eventId: string, householdId: string, input: NewGuestInput): Promise<GuestRow> {
  const { data, error } = await supabase
    .from('bm_guests')
    .insert({ event_id: eventId, household_id: householdId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as GuestRow;
  await logActivity({
    eventId,
    action: 'guest_created',
    entityType: 'guest',
    entityId: row.id,
    summary: `Added guest: ${guestLabel(row)}`,
    after: row,
  });
  return row;
}

export async function updateGuest(id: string, patch: Partial<GuestRow>): Promise<GuestRow> {
  const { data, error } = await supabase.from('bm_guests').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as GuestRow;
  await logActivity({
    eventId: row.event_id,
    action: 'guest_updated',
    entityType: 'guest',
    entityId: row.id,
    summary: `Updated guest: ${guestLabel(row)}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteGuest(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_guests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_guests').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as GuestRow;
    await logActivity({
      eventId: row.event_id,
      action: 'guest_deleted',
      entityType: 'guest',
      entityId: id,
      summary: `Removed guest: ${guestLabel(row)}`,
      before: row,
    });
  }
}

/**
 * Batch persist an up/down (or drag) reorder within one household. Not logged to the activity
 * feed — same reasoning as `data/event/mutations.ts`'s `reorderFunctions`: a drag-order change
 * isn't among the "meaningful" mutations (add/edit/remove, tags, invites) worth an audit row, and
 * logging every reorder step would just spam the feed.
 */
export async function reorderGuestsInHousehold(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_guests').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/* -------------------------------------------------------------------------------------------
   Tags
------------------------------------------------------------------------------------------- */

export interface NewTagInput {
  name: string;
  colour?: string | null;
}

export async function createTag(eventId: string, input: NewTagInput): Promise<TagRow> {
  const { data, error } = await supabase
    .from('bm_tags')
    .insert({ event_id: eventId, name: input.name.trim(), colour: input.colour ?? null })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as TagRow;
  await logActivity({
    eventId,
    action: 'tag_created',
    entityType: 'tag',
    entityId: row.id,
    summary: `Added tag: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateTag(id: string, patch: Partial<Pick<TagRow, 'name' | 'colour'>>): Promise<TagRow> {
  const { data, error } = await supabase.from('bm_tags').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as TagRow;
  await logActivity({
    eventId: row.event_id,
    action: 'tag_updated',
    entityType: 'tag',
    entityId: row.id,
    summary: `Updated tag: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. `is_builtin` is
 *  informational styling, not a lock: a built-in tag can be deleted like any other (see
 *  CLAUDE.md). Cascades to `bm_household_tags`/`bm_guest_tags` via the FK, so anyone wearing this
 *  tag simply loses it — `countTagUsage` is how the caller warns about that before confirming. */
export async function deleteTag(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_tags').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_tags').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as TagRow;
    await logActivity({
      eventId: row.event_id,
      action: 'tag_deleted',
      entityType: 'tag',
      entityId: id,
      summary: `Removed tag: ${row.name}`,
      before: row,
    });
  }
}

/** How many households/guests currently wear a tag — a simple count for TagManager's delete
 *  warning, not a full usage report. */
export async function countTagUsage(tagId: string): Promise<{ households: number; guests: number }> {
  const [householdRes, guestRes] = await Promise.all([
    supabase.from('bm_household_tags').select('id', { count: 'exact', head: true }).eq('tag_id', tagId),
    supabase.from('bm_guest_tags').select('id', { count: 'exact', head: true }).eq('tag_id', tagId),
  ]);
  if (householdRes.error) throw householdRes.error;
  if (guestRes.error) throw guestRes.error;
  return { households: householdRes.count ?? 0, guests: guestRes.count ?? 0 };
}

/**
 * Replace-the-set: diffs `tagIds` against what `bm_household_tags` currently holds for this
 * household and inserts/deletes only the difference, in one function — a caller ticking two
 * boxes and unticking one does three rows of work, not a delete-everything-then-reinsert.
 * `eventId` is resolved from the household itself (a join-table row needs it too, per the
 * schema's denormalised `event_id` on every table) so the caller only ever names the household.
 */
export async function setHouseholdTags(householdId: string, tagIds: string[]): Promise<void> {
  const { data: household, error: householdError } = await supabase
    .from('bm_households')
    .select('id, event_id, name')
    .eq('id', householdId)
    .single();
  if (householdError) throw householdError;

  const { data: current, error: currentError } = await supabase
    .from('bm_household_tags')
    .select('tag_id')
    .eq('household_id', householdId);
  if (currentError) throw currentError;

  const currentIds = new Set((current ?? []).map((r) => r.tag_id));
  const nextIds = new Set(tagIds);
  const toAdd = tagIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('bm_household_tags')
      .insert(toAdd.map((tagId) => ({ event_id: household.event_id, household_id: householdId, tag_id: tagId })));
    if (error) throw error;
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('bm_household_tags')
      .delete()
      .eq('household_id', householdId)
      .in('tag_id', toRemove);
    if (error) throw error;
  }

  await logActivity({
    eventId: household.event_id,
    action: 'household_tags_updated',
    entityType: 'household',
    entityId: householdId,
    summary: `Updated tags for ${household.name}`,
  });
}

/** Same replace-the-set diffing as `setHouseholdTags`, for one guest's own tags. */
export async function setGuestTags(guestId: string, tagIds: string[]): Promise<void> {
  const { data: guest, error: guestError } = await supabase
    .from('bm_guests')
    .select('id, event_id, first_name, last_name')
    .eq('id', guestId)
    .single();
  if (guestError) throw guestError;

  const { data: current, error: currentError } = await supabase
    .from('bm_guest_tags')
    .select('tag_id')
    .eq('guest_id', guestId);
  if (currentError) throw currentError;

  const currentIds = new Set((current ?? []).map((r) => r.tag_id));
  const nextIds = new Set(tagIds);
  const toAdd = tagIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('bm_guest_tags')
      .insert(toAdd.map((tagId) => ({ event_id: guest.event_id, guest_id: guestId, tag_id: tagId })));
    if (error) throw error;
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from('bm_guest_tags').delete().eq('guest_id', guestId).in('tag_id', toRemove);
    if (error) throw error;
  }

  await logActivity({
    eventId: guest.event_id,
    action: 'guest_tags_updated',
    entityType: 'guest',
    entityId: guestId,
    summary: `Updated tags for ${guestLabel(guest)}`,
  });
}

/* -------------------------------------------------------------------------------------------
   Function invites — the family's manual admin-side override. Distinct from the public RSVP
   portal's `bm_rsvp_submit` RPC (Stage 5), which is how a household edits its own answer.
------------------------------------------------------------------------------------------- */

async function loadGuestForInvite(guestId: string) {
  const { data: guest, error } = await supabase
    .from('bm_guests')
    .select('id, event_id, first_name, last_name')
    .eq('id', guestId)
    .single();
  if (error) throw error;
  return guest;
}

/** Upserts on `(guest_id, function_id)` so this works whether or not an invite row already
 *  exists for this guest/function pair — a brand-new guest has none yet. Only `invited` is in
 *  the payload, so an existing row's `rsvp` is left exactly as it was. */
export async function setGuestInvited(guestId: string, functionId: string, invited: boolean): Promise<void> {
  const guest = await loadGuestForInvite(guestId);

  const { error } = await supabase
    .from('bm_guest_function_invites')
    .upsert(
      { event_id: guest.event_id, guest_id: guestId, function_id: functionId, invited },
      { onConflict: 'guest_id,function_id' },
    );
  if (error) throw error;

  await logActivity({
    eventId: guest.event_id,
    action: 'guest_invite_updated',
    entityType: 'guest',
    entityId: guestId,
    summary: `${invited ? 'Invited' : 'Removed invite for'} ${guestLabel(guest)}`,
  });
}

/** Same upsert-on-conflict shape as `setGuestInvited`, for the RSVP answer itself. Clears
 *  `responded_at` back to null for a manual reset to "awaiting", and stamps it otherwise — this
 *  is the admin override, so it does not attempt `bm_rsvp_submit`'s idempotent-portal semantics,
 *  just a plain, honest "the family set this by hand, just now". */
export async function setGuestRsvp(guestId: string, functionId: string, rsvp: RsvpStatus): Promise<void> {
  const guest = await loadGuestForInvite(guestId);

  const { error } = await supabase
    .from('bm_guest_function_invites')
    .upsert(
      {
        event_id: guest.event_id,
        guest_id: guestId,
        function_id: functionId,
        rsvp,
        responded_at: rsvp === 'awaiting' ? null : new Date().toISOString(),
      },
      { onConflict: 'guest_id,function_id' },
    );
  if (error) throw error;

  await logActivity({
    eventId: guest.event_id,
    action: 'guest_rsvp_updated',
    entityType: 'guest',
    entityId: guestId,
    summary: `Set RSVP for ${guestLabel(guest)} to ${rsvp}`,
  });
}

/* -------------------------------------------------------------------------------------------
   Bulk actions — BulkBar's multi-select toolbar. Each is confirmed via confirmDialog by the
   caller before it runs; these functions themselves do not ask.
------------------------------------------------------------------------------------------- */

export async function bulkAddTag(guestIds: string[], tagId: string): Promise<void> {
  if (guestIds.length === 0) return;
  const { data: guests, error: guestsError } = await supabase.from('bm_guests').select('id, event_id').in('id', guestIds);
  if (guestsError) throw guestsError;
  if (!guests || guests.length === 0) return;
  const eventId = guests[0].event_id;

  const { error } = await supabase
    .from('bm_guest_tags')
    .upsert(
      guests.map((g) => ({ event_id: eventId, guest_id: g.id, tag_id: tagId })),
      { onConflict: 'guest_id,tag_id', ignoreDuplicates: true },
    );
  if (error) throw error;

  await logActivity({
    eventId,
    action: 'bulk_tag_added',
    entityType: 'guest',
    summary: `Added a tag to ${pluralGuests(guests.length)}`,
  });
}

export async function bulkSetInvited(guestIds: string[], functionId: string, invited: boolean): Promise<void> {
  if (guestIds.length === 0) return;
  const { data: guests, error: guestsError } = await supabase.from('bm_guests').select('id, event_id').in('id', guestIds);
  if (guestsError) throw guestsError;
  if (!guests || guests.length === 0) return;
  const eventId = guests[0].event_id;

  const { error } = await supabase
    .from('bm_guest_function_invites')
    .upsert(
      guests.map((g) => ({ event_id: eventId, guest_id: g.id, function_id: functionId, invited })),
      { onConflict: 'guest_id,function_id' },
    );
  if (error) throw error;

  await logActivity({
    eventId,
    action: 'bulk_invite_updated',
    entityType: 'guest',
    summary: `${invited ? 'Invited' : 'Removed invite for'} ${pluralGuests(guests.length)}`,
  });
}

export async function bulkSetCategory(householdIds: string[], category: string): Promise<void> {
  if (householdIds.length === 0) return;
  const { data, error } = await supabase
    .from('bm_households')
    .update({ category })
    .in('id', householdIds)
    .select('id, event_id');
  if (error) throw error;
  const rows = data ?? [];
  const eventId = rows[0]?.event_id;
  if (!eventId) return;

  await logActivity({
    eventId,
    action: 'bulk_category_set',
    entityType: 'household',
    summary: `Set category "${category}" on ${rows.length} household${rows.length === 1 ? '' : 's'}`,
  });
}
