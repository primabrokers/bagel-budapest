import { useState } from 'react';
import { CalendarCheck, FolderKanban, Tag as TagIcon, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuItemSpec } from '../ui/Menu';
import { showToast } from '../../hooks/useToast';
import { confirmDialog, promptDialog } from '../../hooks/useConfirm';
import { bulkAddTag, bulkSetCategory, bulkSetInvited } from '../../data/guests/mutations';
import type { FunctionRow } from '../../data/event/types';
import type { HouseholdWithGuests, TagRow } from '../../data/guests/types';

const QUICK_CATEGORIES = ['Family', 'Friends', 'Work', 'Neighbours', 'School'];

function guestWord(n: number): string {
  return `${n} guest${n === 1 ? '' : 's'}`;
}
function householdWord(n: number): string {
  return `${n} household${n === 1 ? '' : 's'}`;
}

interface BulkBarProps {
  selectedGuestIds: string[];
  households: HouseholdWithGuests[];
  tags: TagRow[];
  functions: FunctionRow[];
  onClear: () => void;
  onChanged: () => void;
}

/**
 * The multi-select toolbar for GuestsPage — appears once at least one guest is checked. Sticky at
 * the bottom, matching this app's sheet-footer idiom; each action confirms via `confirmDialog`
 * before calling its bulk mutation.
 */
export function BulkBar({ selectedGuestIds, households, tags, functions, onClear, onChanged }: BulkBarProps) {
  const [busy, setBusy] = useState(false);

  if (selectedGuestIds.length === 0) return null;

  const selectedSet = new Set(selectedGuestIds);
  const householdIdsForSelection = households
    .filter((h) => h.guests.some((g) => selectedSet.has(g.id)))
    .map((h) => h.id);

  async function handleAddTag(tag: TagRow) {
    const ok = await confirmDialog(`Add "${tag.name}" to ${guestWord(selectedGuestIds.length)}?`);
    if (!ok) return;
    setBusy(true);
    try {
      await bulkAddTag(selectedGuestIds, tag.id);
      showToast('Tag added', 'success');
      onChanged();
      onClear();
    } catch {
      showToast('Could not add the tag — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetInvited(fn: FunctionRow, invited: boolean) {
    const message = invited
      ? `Invite ${guestWord(selectedGuestIds.length)} to ${fn.name}?`
      : `Remove the invite to ${fn.name} for ${guestWord(selectedGuestIds.length)}?`;
    const ok = await confirmDialog(message);
    if (!ok) return;
    setBusy(true);
    try {
      await bulkSetInvited(selectedGuestIds, fn.id, invited);
      showToast('Updated', 'success');
      onChanged();
      onClear();
    } catch {
      showToast('Could not update the invite — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function applyCategory(category: string) {
    const ok = await confirmDialog(`Set category to "${category}" for ${householdWord(householdIdsForSelection.length)}?`);
    if (!ok) return;
    setBusy(true);
    try {
      await bulkSetCategory(householdIdsForSelection, category);
      showToast('Updated', 'success');
      onChanged();
      onClear();
    } catch {
      showToast('Could not update the category — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCustomCategory() {
    const value = await promptDialog('Set category', { input: { label: 'Category', required: true } });
    if (value == null) return;
    await applyCategory(value.trim());
  }

  const tagItems: MenuItemSpec[] =
    tags.length > 0
      ? tags.map((t) => ({ key: t.id, label: t.name, onSelect: () => void handleAddTag(t) }))
      : [{ key: 'none', label: 'No tags yet', onSelect: () => {}, disabled: true }];

  const inviteItems: MenuItemSpec[] = functions.flatMap((fn) => [
    { key: `${fn.id}-on`, label: `Invite to ${fn.name}`, onSelect: () => void handleSetInvited(fn, true) },
    {
      key: `${fn.id}-off`,
      label: `Remove invite: ${fn.name}`,
      onSelect: () => void handleSetInvited(fn, false),
      tone: 'danger' as const,
    },
  ]);

  const categoryItems: MenuItemSpec[] = [
    ...QUICK_CATEGORIES.map((c) => ({ key: c, label: c, onSelect: () => void applyCategory(c) })),
    { key: 'custom', label: 'Custom…', onSelect: () => void handleCustomCategory(), separatorBefore: true },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Bulk guest actions"
      className="bottom-above-tabbar fixed inset-x-3 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-separator bg-surface px-4 py-3 shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-lg"
    >
      <span className="text-sm font-medium text-text-primary">{guestWord(selectedGuestIds.length)} selected</span>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
        <Menu
          label="Add tag"
          align="right"
          items={tagItems}
          trigger={(props) => (
            <Button {...props} type="button" variant="secondary" size="sm" disabled={busy}>
              <TagIcon size={14} aria-hidden="true" />
              Tag
            </Button>
          )}
        />
        {functions.length > 0 && (
          <Menu
            label="Bulk function invite"
            align="right"
            items={inviteItems}
            trigger={(props) => (
              <Button {...props} type="button" variant="secondary" size="sm" disabled={busy}>
                <CalendarCheck size={14} aria-hidden="true" />
                Invite
              </Button>
            )}
          />
        )}
        <Menu
          label="Set category"
          align="right"
          items={categoryItems}
          trigger={(props) => (
            <Button {...props} type="button" variant="secondary" size="sm" disabled={busy}>
              <FolderKanban size={14} aria-hidden="true" />
              Category
            </Button>
          )}
        />
        <IconButton label="Clear selection" size="sm" onClick={onClear}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
