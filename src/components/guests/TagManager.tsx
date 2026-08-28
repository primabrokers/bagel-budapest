import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { countTagUsage, createTag, deleteTag, updateTag } from '../../data/guests/mutations';
import type { TagRow } from '../../data/guests/types';

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  tags: TagRow[];
  onChanged: () => void;
}

/**
 * View/add/rename/delete the event's tags. The nine built-in tags (Family, Close family,
 * Friends…) already exist by the time this renders — `bm_seed_demo_event()` seeds them — so this
 * component never creates them itself, only manages what's already there. `is_builtin` is
 * informational styling only: a built-in tag can be renamed or deleted like any other.
 */
export function TagManager({ open, onClose, eventId, tags, onChanged }: TagManagerProps) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      showToast('Give the tag a name.', 'error');
      return;
    }
    setCreating(true);
    try {
      await createTag(eventId, { name });
      setNewName('');
      showToast('Tag added', 'success');
      onChanged();
    } catch {
      showToast('Could not add — check the name is not already used.', 'error');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  async function handleRename(tag: TagRow) {
    const name = editingName.trim();
    if (!name || name === tag.name) {
      setEditingId(null);
      return;
    }
    setBusyId(tag.id);
    try {
      await updateTag(tag.id, { name });
      showToast('Renamed', 'success');
      onChanged();
    } catch {
      showToast('Could not rename — check the name is not already used.', 'error');
    } finally {
      setBusyId(null);
      setEditingId(null);
    }
  }

  async function handleDelete(tag: TagRow) {
    setBusyId(tag.id);
    let usage: { households: number; guests: number };
    try {
      usage = await countTagUsage(tag.id);
    } catch {
      showToast('Could not check tag usage — please try again.', 'error');
      setBusyId(null);
      return;
    }
    const usedCount = usage.households + usage.guests;
    const ok = await confirmDialog(`Delete "${tag.name}"?`, {
      body:
        usedCount > 0
          ? `Currently applied to ${usage.households} household${usage.households === 1 ? '' : 's'} and ${usage.guests} guest${usage.guests === 1 ? '' : 's'} — they will simply lose it.`
          : 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) {
      setBusyId(null);
      return;
    }
    try {
      await deleteTag(tag.id);
      showToast('Deleted', 'success');
      onChanged();
    } catch {
      showToast('Could not delete — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Manage tags" icon={<Tags size={16} aria-hidden="true" />} anchor="drawer">
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <Field label="New tag" htmlFor="new-tag-name" className="flex-1">
            <Input
              id="new-tag-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Neighbours"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
            />
          </Field>
          <Button type="button" onClick={() => void handleCreate()} disabled={creating}>
            <Plus size={15} aria-hidden="true" />
            Add
          </Button>
        </div>

        {tags.length === 0 ? (
          <EmptyState compact icon={Tags} title="No tags yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-separator">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2 py-2.5">
                {editingId === tag.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => void handleRename(tag)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRename(tag);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-text-primary">{tag.name}</p>
                    {tag.is_builtin && <Badge variant="muted">Built in</Badge>}
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={`Rename ${tag.name}`} size="sm" disabled={busyId !== null} onClick={() => startEdit(tag)}>
                    <Pencil size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Delete ${tag.name}`} size="sm" disabled={busyId !== null} onClick={() => void handleDelete(tag)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
