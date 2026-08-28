import { useMemo, useState } from 'react';
import { Pencil, Pin, Plus, StickyNote, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Select } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { confirmDialog } from '../hooks/useConfirm';
import { useNotes } from '../data/notes/hooks';
import { deleteNote, setNotePinned, updateNote } from '../data/notes/mutations';
import { toggleChecklistItem } from '../lib/markdown';
import { NoteBody } from '../components/notes/NoteBody';
import { NoteEditorSheet } from '../components/notes/NoteEditorSheet';
import type { NoteEntityType, NoteRow } from '../data/notes/types';

const ENTITY_LABELS: Record<NoteEntityType, string> = {
  vendor: 'Vendor',
  guest: 'Guest',
  household: 'Household',
  idea: 'Idea',
  task: 'Task',
  function: 'Function',
};

export function NotesPage() {
  const { data: notesData, loading, reload } = useNotes();
  const notes = useMemo(() => notesData ?? [], [notesData]);

  const [tagFilter, setTagFilter] = useState('all');
  const [sheetState, setSheetState] = useState<{ note: NoteRow | null } | null>(null);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tagsInUse = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const filtered = tagFilter === 'all' ? notes : notes.filter((n) => n.tags.includes(tagFilter));

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

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <PageHeader
        title="Notes"
        subtitle="Freeform notes and checklists for the whole family to see."
        actions={
          <Button type="button" onClick={() => setSheetState({ note: null })}>
            <Plus size={15} aria-hidden="true" />
            Add note
          </Button>
        }
      />

      {tagsInUse.length > 0 && (
        <div className="mb-4">
          <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag" className="sm:w-56">
            <option value="all">All tags</option>
            {tagsInUse.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>
        </div>
      )}

      {loading && !notesData ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={notes.length > 0 ? 'No notes with that tag' : 'No notes yet'}
          hint={notes.length > 0 ? 'Try a different tag, or clear the filter.' : 'Jot down anything worth remembering — a florist recommendation, a seating decision, a to-do list.'}
          action={
            notes.length === 0 && (
              <Button type="button" size="sm" onClick={() => setSheetState({ note: null })}>
                <Plus size={14} aria-hidden="true" />
                Add note
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((note) => (
            <li key={note.id}>
              <Card padding="sm" className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{note.title || 'Untitled note'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {note.entity_type && <Badge variant="plum">{ENTITY_LABELS[note.entity_type]}</Badge>}
                      {note.tags.map((tag) => (
                        <Badge key={tag} variant="muted">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      label={note.pinned ? 'Unpin note' : 'Pin note'}
                      size="sm"
                      disabled={pinBusyId === note.id}
                      onClick={() => void handleTogglePinned(note)}
                    >
                      <Pin size={14} aria-hidden="true" className={note.pinned ? 'fill-gold-500 text-gold-500' : undefined} />
                    </IconButton>
                    <IconButton label="Edit note" size="sm" onClick={() => setSheetState({ note })}>
                      <Pencil size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label="Delete note"
                      size="sm"
                      disabled={deletingId !== null}
                      onClick={() => void handleDelete(note)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
                <NoteBody body={note.body} onToggleLine={(line) => void handleToggleLine(note, line)} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <NoteEditorSheet
        open={sheetState !== null}
        onClose={() => setSheetState(null)}
        note={sheetState?.note ?? null}
        onSaved={reload}
      />
    </div>
  );
}
