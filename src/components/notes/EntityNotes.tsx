import { useState } from 'react';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SkeletonText } from '../ui/Skeleton';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEntityNotes } from '../../data/notes/hooks';
import { deleteNote, setNotePinned, updateNote } from '../../data/notes/mutations';
import { toggleChecklistItem } from '../../lib/markdown';
import { NoteBody } from './NoteBody';
import { NoteEditorSheet } from './NoteEditorSheet';
import type { NoteEntityType, NoteRow } from '../../data/notes/types';

interface EntityNotesProps {
  entityType: NoteEntityType;
  entityId: string;
  className?: string;
}

/**
 * A compact notes list plus inline create/edit, meant to be dropped into any record sheet —
 * `IdeaSheet` is its one real embed this stage (see the file-ownership note in
 * docs/barmitzvah-planner-plan.md §6 stage 9: the vendor/guest sheets get this wired in by hand
 * afterwards, to avoid two concurrent agents editing the same file).
 */
export function EntityNotes({ entityType, entityId, className }: EntityNotesProps) {
  const { data: notes, loading, reload } = useEntityNotes(entityType, entityId);
  const [sheetState, setSheetState] = useState<{ note: NoteRow | null } | null>(null);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleTogglePinned(note: NoteRow) {
    setPinBusyId(note.id);
    try {
      await setNotePinned(note.id, !note.pinned);
      reload();
    } catch {
      showToast('Could not update — please try again.', 'error');
    } finally {
      setPinBusyId(null);
    }
  }

  async function handleToggleLine(note: NoteRow, line: number) {
    try {
      // Not logged — see the comment on `updateNote` in data/notes/mutations.ts.
      await updateNote(note.id, { body: toggleChecklistItem(note.body, line) }, { log: false });
      reload();
    } catch {
      showToast('Could not update that checklist item — please try again.', 'error');
    }
  }

  async function handleDelete(note: NoteRow) {
    const ok = await confirmDialog('Delete this note?', { body: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    setDeletingId(note.id);
    try {
      await deleteNote(note.id);
      showToast('Note deleted', 'success');
      reload();
    } catch {
      showToast('Could not delete — please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const list = notes ?? [];

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Notes</h3>
        <Button type="button" variant="secondary" size="sm" onClick={() => setSheetState({ note: null })}>
          <Plus size={14} aria-hidden="true" />
          Add note
        </Button>
      </div>

      {loading && !notes ? (
        <SkeletonText lines={2} />
      ) : list.length === 0 ? (
        <p className="text-xs text-text-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((note) => (
            <li key={note.id} className="rounded-md border border-separator-soft p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{note.title || 'Untitled note'}</p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label={note.pinned ? 'Unpin note' : 'Pin note'}
                    size="sm"
                    disabled={pinBusyId === note.id}
                    onClick={() => void handleTogglePinned(note)}
                  >
                    <Pin size={13} aria-hidden="true" className={note.pinned ? 'fill-gold-500 text-gold-500' : undefined} />
                  </IconButton>
                  <IconButton label="Edit note" size="sm" onClick={() => setSheetState({ note })}>
                    <Pencil size={13} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Delete note"
                    size="sm"
                    disabled={deletingId !== null}
                    onClick={() => void handleDelete(note)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
              <NoteBody body={note.body} onToggleLine={(line) => void handleToggleLine(note, line)} className="mt-1.5" />
            </li>
          ))}
        </ul>
      )}

      <NoteEditorSheet
        open={sheetState !== null}
        onClose={() => setSheetState(null)}
        note={sheetState?.note ?? null}
        entityType={entityType}
        entityId={entityId}
        onSaved={reload}
        layer="raised"
      />
    </div>
  );
}
