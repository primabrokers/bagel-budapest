import { useEffect, useRef, useState } from 'react';
import { Bold, CheckSquare, Italic, Link as LinkIcon, List, Trash2, X } from 'lucide-react';
import { Sheet, type SheetLayer } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input } from '../ui/Field';
import { Tabs, type TabItem } from '../ui/Tabs';
import { Toggle } from '../ui/Toggle';
import { cn } from '../../lib/cn';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { createNote, deleteNote, updateNote, type NoteInput } from '../../data/notes/mutations';
import { NoteBody } from './NoteBody';
import { toggleChecklistItem } from '../../lib/markdown';
import type { NoteEntityType, NoteRow } from '../../data/notes/types';

interface NoteEditorSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — creating a fresh note. */
  note: NoteRow | null;
  /** Fixes the note to one record when creating from `EntityNotes` — ignored when `note` is set,
   *  since editing never changes what a note is linked to (see `handleSubmit`). */
  entityType?: NoteEntityType | null;
  entityId?: string | null;
  onSaved: () => void;
  /** `raised` when opened from inside another Sheet (`EntityNotes` embedded in a record sheet) —
   *  see `ui/Sheet`'s LAYER note. */
  layer?: SheetLayer;
}

interface NoteFormState {
  title: string;
  body: string;
  pinned: boolean;
  tags: string[];
}

const EMPTY_FORM: NoteFormState = { title: '', body: '', pinned: false, tags: [] };

function toForm(note: NoteRow): NoteFormState {
  return { title: note.title ?? '', body: note.body, pinned: note.pinned, tags: note.tags };
}

type Mode = 'edit' | 'preview';

const MODE_TABS: TabItem<Mode>[] = [
  { key: 'edit', label: 'Write' },
  { key: 'preview', label: 'Preview' },
];

interface SelectionResult {
  value: string;
  start: number;
  end: number;
}

/** Wraps the current selection (or a placeholder, when nothing is selected) in `before`/`after` —
 *  bold/italic. Returns the new full value plus where the selection should land afterwards, so
 *  typing immediately replaces the placeholder. */
function applyInlineWrap(textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string): SelectionResult {
  const { selectionStart, selectionEnd, value } = textarea;
  const hasSelection = selectionEnd > selectionStart;
  const inner = hasSelection ? value.slice(selectionStart, selectionEnd) : placeholder;
  const nextValue = value.slice(0, selectionStart) + before + inner + after + value.slice(selectionEnd);
  const start = selectionStart + before.length;
  return { value: nextValue, start, end: start + inner.length };
}

/** `[label](url)` — the selection becomes the label, and the new selection lands on the URL
 *  placeholder so typing an address overwrites it directly. */
function applyLink(textarea: HTMLTextAreaElement): SelectionResult {
  const { selectionStart, selectionEnd, value } = textarea;
  const hasSelection = selectionEnd > selectionStart;
  const label = hasSelection ? value.slice(selectionStart, selectionEnd) : 'link text';
  const urlPlaceholder = 'https://';
  const insert = `[${label}](${urlPlaceholder})`;
  const nextValue = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  const urlStart = selectionStart + 1 + label.length + 2;
  return { value: nextValue, start: urlStart, end: urlStart + urlPlaceholder.length };
}

/** Prefixes every line touched by the selection with `prefix` (`- ` or `- [ ] `) — a single line
 *  when nothing is selected, every line the selection spans otherwise. Lines already carrying the
 *  prefix are left alone rather than double-prefixed. */
function applyLinePrefix(textarea: HTMLTextAreaElement, prefix: string): SelectionResult {
  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const nextBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;

  const segment = value.slice(lineStart, lineEnd);
  const prefixed = segment
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n');

  const nextValue = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  const delta = prefixed.length - segment.length;
  return { value: nextValue, start: selectionStart + prefix.length, end: selectionEnd + delta };
}

type ToolbarAction = 'bold' | 'italic' | 'link' | 'bullet' | 'checklist';

function applyToolbarAction(textarea: HTMLTextAreaElement, action: ToolbarAction): SelectionResult {
  switch (action) {
    case 'bold':
      return applyInlineWrap(textarea, '**', '**', 'bold text');
    case 'italic':
      return applyInlineWrap(textarea, '*', '*', 'italic text');
    case 'link':
      return applyLink(textarea);
    case 'bullet':
      return applyLinePrefix(textarea, '- ');
    case 'checklist':
      return applyLinePrefix(textarea, '- [ ] ');
  }
}

const TOOLBAR_ITEMS: { action: ToolbarAction; label: string; icon: typeof Bold }[] = [
  { action: 'bold', label: 'Bold', icon: Bold },
  { action: 'italic', label: 'Italic', icon: Italic },
  { action: 'link', label: 'Link', icon: LinkIcon },
  { action: 'bullet', label: 'Bullet list', icon: List },
  { action: 'checklist', label: 'Checklist', icon: CheckSquare },
];

/**
 * Create/edit sheet for one note: title, a markdown toolbar over a plain `Textarea`, an
 * edit/preview toggle (`NoteBody` doubles as the preview — no split pane, phone width doesn't
 * have room), pinned, and tags. Used both standalone (`NotesPage`, no `entityType`/`entityId`)
 * and embedded (`EntityNotes`, both set) — see the props doc above for how the two differ.
 */
export function NoteEditorSheet({ open, onClose, note, entityType, entityId, onSaved, layer }: NoteEditorSheetProps) {
  const { eventId } = useEventContext();
  const [form, setForm] = useState<NoteFormState>(EMPTY_FORM);
  const [mode, setMode] = useState<Mode>('edit');
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(note ? toForm(note) : EMPTY_FORM);
    setMode('edit');
    setTagDraft('');
  }, [open, note]);

  function set<K extends keyof NoteFormState>(key: K, value: NoteFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleToolbar(action: ToolbarAction) {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyToolbarAction(el, action);
    set('body', result.value);
    // The textarea is controlled by `form.body`, so the DOM value only catches up once React
    // re-renders — restoring the selection has to wait one frame for that to land, or it clamps
    // against the stale (shorter) value still in the DOM.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  }

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag || form.tags.includes(tag)) {
      setTagDraft('');
      return;
    }
    set('tags', [...form.tags, tag]);
    setTagDraft('');
  }

  function removeTag(tag: string) {
    set(
      'tags',
      form.tags.filter((t) => t !== tag),
    );
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const patch: NoteInput = {
        title: form.title.trim() || null,
        body: form.body,
        pinned: form.pinned,
        tags: form.tags,
        // Editing never changes what a note is linked to — there is no entity picker in this
        // form — so an existing note keeps exactly the linkage it already had. Only a brand-new
        // note picks up the `entityType`/`entityId` the caller (e.g. `EntityNotes`) fixed it to.
        entity_type: note ? note.entity_type : (entityType ?? null),
        entity_id: note ? note.entity_id : (entityId ?? null),
      };
      if (note) {
        await updateNote(note.id, patch);
      } else {
        await createNote(eventId, patch);
      }
      showToast('Saved', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!note) return;
    const ok = await confirmDialog('Delete this note?', {
      body: 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteNote(note.id);
      showToast('Note deleted', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not delete — please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={note ? 'Edit note' : 'Add note'}
      anchor="drawer"
      layer={layer}
      footer={
        <>
          {note && (
            <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={deleting || saving} className="mr-auto">
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || deleting}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" htmlFor="note-title" hint="Optional">
          <Input id="note-title" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
          <span className="text-sm text-text-secondary">Pin to the top</span>
          <Toggle checked={form.pinned} onChange={(v) => set('pinned', v)} label="Pin this note" />
        </div>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            {form.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-full text-text-faint hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Add a tag…"
              aria-label="Add a tag"
              className="h-7 w-28 px-2 py-1 text-xs"
            />
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text-secondary">Note</span>
            <Tabs items={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Write or preview" variant="segmented" size="xs" />
          </div>

          {mode === 'edit' ? (
            <>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-separator-soft bg-canvas p-1">
                {TOOLBAR_ITEMS.map(({ action, label, icon: Icon }) => (
                  <IconButton key={action} label={label} size="sm" onClick={() => handleToolbar(action)}>
                    <Icon size={14} aria-hidden="true" />
                  </IconButton>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                rows={8}
                placeholder="Write in markdown — **bold**, *italic*, [links](https://…), - bullets, - [ ] checklists."
                className={cn(
                  'w-full rounded-md border border-separator-control bg-surface px-3 py-2 text-sm leading-relaxed text-text-primary',
                  'placeholder:text-text-faint transition-colors',
                  'focus-visible:outline-none focus-visible:border-plum-400 focus-visible:ring-2 focus-visible:ring-plum-400/15',
                )}
              />
            </>
          ) : (
            <div className="rounded-md border border-separator-soft bg-canvas px-3 py-3">
              <NoteBody
                body={form.body}
                onToggleLine={(line) => set('body', toggleChecklistItem(form.body, line))}
              />
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
