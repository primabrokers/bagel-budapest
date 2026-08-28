import { useState } from 'react';
import { ChevronDown, ChevronUp, MoreVertical, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input } from '../ui/Field';
import { Menu as ActionMenu } from '../ui/Menu';
import { EmptyState } from '../ui/EmptyState';
import { Money } from '../ui/Money';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import {
  createSection,
  deleteMenuItem,
  deleteSection,
  reorderMenuItems,
  reorderSections,
  updateMenuItem,
  updateSection,
} from '../../data/menus/mutations';
import { MenuItemSheet } from './MenuItemSheet';
import type { MenuItemRow, MenuSectionWithItems, MenuWithSections } from '../../data/menus/types';

interface MenuEditorProps {
  eventId: string;
  menu: MenuWithSections;
  onReload: () => void;
}

/** Swaps the element at `index` with its neighbour in `direction`, returning null at either end
 *  of the list. Reordering always re-numbers the WHOLE list to its new array position (0, 1, 2…)
 *  rather than trying to preserve gaps in the original `sort_order` values — simple, and correct
 *  regardless of what the stored values happened to be. */
function swapNeighbour<T>(list: T[], index: number, direction: 'up' | 'down'): T[] | null {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The section/item editor for one menu version — add/rename/reorder/delete sections, add/edit/
 *  reorder/delete/approve items within each. */
export function MenuEditor({ eventId, menu, onReload }: MenuEditorProps) {
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemSheet, setItemSheet] = useState<{ sectionId: string; item: MenuItemRow | null } | null>(null);

  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) {
      showToast('Give the section a name.', 'error');
      return;
    }
    setAddingSection(true);
    try {
      await createSection(eventId, menu.id, { name, sort_order: menu.sections.length });
      setNewSectionName('');
      showToast('Section added', 'success');
      onReload();
    } catch {
      showToast('Could not add that section — please try again.', 'error');
    } finally {
      setAddingSection(false);
    }
  }

  async function handleMoveSection(index: number, direction: 'up' | 'down') {
    const reordered = swapNeighbour(menu.sections, index, direction);
    if (!reordered) return;
    setBusyId(menu.sections[index].id);
    try {
      await reorderSections(reordered.map((s, i) => ({ id: s.id, sort_order: i })));
      onReload();
    } catch {
      showToast('Could not reorder sections — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteSection(section: MenuSectionWithItems) {
    const ok = await confirmDialog(`Remove "${section.name}"?`, {
      body: section.items.length > 0 ? `This also removes its ${section.items.length} dish${section.items.length === 1 ? '' : 'es'}.` : 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusyId(section.id);
    try {
      await deleteSection(section.id);
      showToast('Section removed', 'success');
      onReload();
    } catch {
      showToast('Could not remove that section — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleMoveItem(section: MenuSectionWithItems, index: number, direction: 'up' | 'down') {
    const reordered = swapNeighbour(section.items, index, direction);
    if (!reordered) return;
    setBusyId(section.items[index].id);
    try {
      await reorderMenuItems(reordered.map((it, i) => ({ id: it.id, sort_order: i })));
      onReload();
    } catch {
      showToast('Could not reorder that section — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleApproved(item: MenuItemRow) {
    setBusyId(item.id);
    try {
      await updateMenuItem(item.id, { approved: !item.approved });
      onReload();
    } catch {
      showToast('Could not update that dish — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteItem(item: MenuItemRow) {
    const ok = await confirmDialog(`Remove "${item.name}"?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await deleteMenuItem(item.id);
      showToast('Dish removed', 'success');
      onReload();
    } catch {
      showToast('Could not remove that dish — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {menu.sections.length === 0 && (
        <EmptyState compact icon={UtensilsCrossed} title="No sections yet" hint="Add a section — Starters, Mains, Dessert — to start building this menu." />
      )}

      {menu.sections.map((section, sectionIndex) => (
        <Card key={section.id} padding="sm" shadow="none">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{section.name}</h3>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={`Move ${section.name} up`}
                size="sm"
                disabled={sectionIndex === 0 || busyId !== null}
                onClick={() => void handleMoveSection(sectionIndex, 'up')}
              >
                <ChevronUp size={14} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Move ${section.name} down`}
                size="sm"
                disabled={sectionIndex === menu.sections.length - 1 || busyId !== null}
                onClick={() => void handleMoveSection(sectionIndex, 'down')}
              >
                <ChevronDown size={14} aria-hidden="true" />
              </IconButton>
              <SectionRenameField section={section} busy={busyId === section.id} onSaved={onReload} />
              <IconButton
                label={`Remove section: ${section.name}`}
                size="sm"
                disabled={busyId !== null}
                onClick={() => void handleDeleteSection(section)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          {section.items.length === 0 ? (
            <p className="py-2 text-xs text-text-muted">No dishes in this section yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator-soft">
              {section.items.map((item, itemIndex) => (
                <li key={item.id} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-text-primary">{item.name}</p>
                      <Badge variant={item.approved ? 'success' : 'muted'}>{item.approved ? 'Approved' : 'Not approved'}</Badge>
                      {item.allergens.map((a) => (
                        <Badge key={a} variant="warning">
                          {a}
                        </Badge>
                      ))}
                    </div>
                    {item.description && <p className="mt-0.5 truncate text-xs text-text-muted">{item.description}</p>}
                    <p className="mt-0.5 text-xs text-text-muted">
                      {item.serving_style ?? ''}
                      {item.serving_style && item.quantity != null ? ' · ' : ''}
                      {item.quantity != null ? `Qty ${item.quantity}` : ''}
                      {item.cost != null && (item.serving_style || item.quantity != null) ? ' · ' : ''}
                      {item.cost != null && <Money value={item.cost} />}
                    </p>
                  </div>

                  <ActionMenu
                    label={`Actions for ${item.name}`}
                    trigger={(triggerProps) => (
                      <IconButton label={`Actions for ${item.name}`} size="sm" {...triggerProps}>
                        <MoreVertical size={14} aria-hidden="true" />
                      </IconButton>
                    )}
                    items={[
                      { key: 'edit', label: 'Edit', onSelect: () => setItemSheet({ sectionId: section.id, item }) },
                      {
                        key: 'approve',
                        label: item.approved ? 'Mark not approved' : 'Mark approved',
                        onSelect: () => void handleToggleApproved(item),
                      },
                      { key: 'up', label: 'Move up', disabled: itemIndex === 0, onSelect: () => void handleMoveItem(section, itemIndex, 'up') },
                      {
                        key: 'down',
                        label: 'Move down',
                        disabled: itemIndex === section.items.length - 1,
                        onSelect: () => void handleMoveItem(section, itemIndex, 'down'),
                      },
                      { key: 'remove', label: 'Remove', tone: 'danger', separatorBefore: true, onSelect: () => void handleDeleteItem(item) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setItemSheet({ sectionId: section.id, item: null })}
          >
            <Plus size={14} aria-hidden="true" />
            Add dish
          </Button>
        </Card>
      ))}

      <div className="flex items-end gap-2">
        <Field label="New section" htmlFor="new-section-name" className="flex-1">
          <Input
            id="new-section-name"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder="e.g. Starters"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddSection();
            }}
          />
        </Field>
        <Button type="button" onClick={() => void handleAddSection()} disabled={addingSection}>
          <Plus size={15} aria-hidden="true" />
          Add
        </Button>
      </div>

      {itemSheet && (
        <MenuItemSheet
          open
          onClose={() => setItemSheet(null)}
          eventId={eventId}
          sectionId={itemSheet.sectionId}
          item={itemSheet.item}
          onSaved={onReload}
        />
      )}
    </div>
  );
}

/** An inline rename control for a section — a pencil icon that swaps to a text field, save on
 *  blur/Enter, matching the quick-rename idiom `TagManager` already uses for tags. */
function SectionRenameField({ section, busy, onSaved }: { section: MenuSectionWithItems; busy: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(section.name);

  async function commit() {
    const name = value.trim();
    setEditing(false);
    if (!name || name === section.name) {
      setValue(section.name);
      return;
    }
    try {
      await updateSection(section.id, { name });
      onSaved();
    } catch {
      showToast('Could not rename that section — please try again.', 'error');
      setValue(section.name);
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') {
            setValue(section.name);
            setEditing(false);
          }
        }}
        className="h-[44px] w-32 sm:h-9"
      />
    );
  }

  return (
    <IconButton
      label={`Rename section: ${section.name}`}
      size="sm"
      disabled={busy}
      onClick={() => {
        setValue(section.name);
        setEditing(true);
      }}
    >
      <Pencil size={14} aria-hidden="true" />
    </IconButton>
  );
}
