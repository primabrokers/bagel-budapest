import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { MenuItemRow, MenuRow, MenuSectionRow } from './types';

export interface MenuInput {
  function_id?: string | null;
  name: string;
  version_label?: string | null;
  is_final?: boolean;
}

export async function createMenu(eventId: string, input: MenuInput): Promise<MenuRow> {
  const { data, error } = await supabase
    .from('bm_menus')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as MenuRow;
  await logActivity({
    eventId,
    action: 'menu_created',
    entityType: 'menu',
    entityId: row.id,
    summary: `Added menu: ${row.name}`,
    after: row,
  });
  return row;
}

export async function updateMenu(id: string, patch: Partial<MenuInput>): Promise<MenuRow> {
  const { data, error } = await supabase.from('bm_menus').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as MenuRow;
  await logActivity({
    eventId: row.event_id,
    action: 'menu_updated',
    entityType: 'menu',
    entityId: row.id,
    summary: `Updated menu: ${row.name}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. Cascades to the menu's
 *  own sections and items via the FK's `on delete cascade` (migration 6). */
export async function deleteMenu(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_menus').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_menus').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as MenuRow;
    await logActivity({
      eventId: row.event_id,
      action: 'menu_deleted',
      entityType: 'menu',
      entityId: id,
      summary: `Removed menu: ${row.name}`,
      before: row,
    });
  }
}

/** Every other menu for the same function (matching `function_id`, including the null/"general"
 *  group) loses its `is_final` flag first — see `MenuRow.is_final`'s doc comment: at most one
 *  final version per function is the model the Menu screen presents. */
async function clearSiblingFinals(eventId: string, functionId: string | null, exceptMenuId: string): Promise<void> {
  let query = supabase.from('bm_menus').update({ is_final: false }).eq('event_id', eventId).neq('id', exceptMenuId);
  query = functionId === null ? query.is('function_id', null) : query.eq('function_id', functionId);
  const { error } = await query;
  if (error) throw error;
}

export async function setMenuFinal(id: string, isFinal: boolean): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_menus').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error('Menu not found.');
  const menu = existing as MenuRow;

  if (isFinal) {
    await clearSiblingFinals(menu.event_id, menu.function_id, id);
  }

  const { error } = await supabase.from('bm_menus').update({ is_final: isFinal }).eq('id', id);
  if (error) throw error;

  await logActivity({
    eventId: menu.event_id,
    action: isFinal ? 'menu_marked_final' : 'menu_unmarked_final',
    entityType: 'menu',
    entityId: id,
    summary: `${isFinal ? 'Marked' : 'Unmarked'} "${menu.name}" as the final menu`,
  });
}

export interface MenuSectionInput {
  name: string;
  sort_order?: number;
}

export async function createSection(eventId: string, menuId: string, input: MenuSectionInput): Promise<MenuSectionRow> {
  const { data, error } = await supabase
    .from('bm_menu_sections')
    .insert({ event_id: eventId, menu_id: menuId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as MenuSectionRow;
  await logActivity({
    eventId,
    action: 'menu_section_created',
    entityType: 'menu',
    entityId: menuId,
    summary: `Added section: ${row.name}`,
    after: row,
  });
  return row;
}

/** Renaming a section in place is bookkeeping, not a new decision — same convention as
 *  `data/vendors/mutations.ts`'s `updateQuote`, which is also not logged. */
export async function updateSection(id: string, patch: Partial<MenuSectionInput>): Promise<void> {
  const { error } = await supabase.from('bm_menu_sections').update(patch).eq('id', id);
  if (error) throw error;
}

/** Confirm with the user before calling this — it does not ask itself. Cascades to the section's
 *  own items via the FK's `on delete cascade`. */
export async function deleteSection(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_menu_sections')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_menu_sections').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as MenuSectionRow;
    await logActivity({
      eventId: row.event_id,
      action: 'menu_section_deleted',
      entityType: 'menu',
      entityId: row.menu_id,
      summary: `Removed section: ${row.name}`,
      before: row,
    });
  }
}

/** Batch persist an up/down reorder. Not logged — same convention as `data/event/mutations.ts`'s
 *  `reorderFunctions`: a drag/up-down order change is not among the "meaningful" mutations. */
export async function reorderSections(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_menu_sections').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export interface MenuItemInput {
  name: string;
  description?: string | null;
  vendor_id?: string | null;
  cost?: number | null;
  quantity?: number | null;
  serving_style?: string | null;
  allergens?: string[];
  approved?: boolean;
  sort_order?: number;
}

export async function createMenuItem(eventId: string, sectionId: string, input: MenuItemInput): Promise<MenuItemRow> {
  const { data, error } = await supabase
    .from('bm_menu_items')
    .insert({ event_id: eventId, section_id: sectionId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as MenuItemRow;
  await logActivity({
    eventId,
    action: 'menu_item_created',
    entityType: 'menu',
    entityId: sectionId,
    summary: `Added menu item: ${row.name}`,
    after: row,
  });
  return row;
}

/** Editing an item's own fields in place — cost, description, the approved toggle — is
 *  bookkeeping, not logged; same convention as `updateSection`/`updateQuote` above. The item's
 *  existence (`createMenuItem`/`deleteMenuItem`) is what the activity feed cares about. */
export async function updateMenuItem(id: string, patch: Partial<MenuItemInput>): Promise<void> {
  const { error } = await supabase.from('bm_menu_items').update(patch).eq('id', id);
  if (error) throw error;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteMenuItem(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_menu_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_menu_items').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as MenuItemRow;
    await logActivity({
      eventId: row.event_id,
      action: 'menu_item_deleted',
      entityType: 'menu',
      entityId: row.section_id,
      summary: `Removed menu item: ${row.name}`,
      before: row,
    });
  }
}

/** Batch persist an up/down reorder. Not logged — same convention as `reorderSections` above. */
export async function reorderMenuItems(updates: { id: string; sort_order: number }[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from('bm_menu_items').update({ sort_order: u.sort_order }).eq('id', u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
