import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { useVendors } from '../../data/vendors/hooks';
import {
  createIdea,
  deleteIdea,
  getSignedIdeaImageUrl,
  updateIdea,
  uploadIdeaImage,
  type IdeaInput,
} from '../../data/ideas/mutations';
import { EntityNotes } from '../notes/EntityNotes';
import { normaliseMoneyInput, parseMoneyInput } from '../../lib/format';
import { IDEA_STATUSES, IDEA_STATUS_LABELS } from './statusMeta';
import type { IdeaBoardRow, IdeaRow, IdeaStatus } from '../../data/ideas/types';

interface IdeaSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — adding a new idea. */
  idea: IdeaRow | null;
  boards: IdeaBoardRow[];
  /** Preselects a board when adding from within one of `IdeasPage`'s board columns. Ignored when
   *  editing an existing idea. */
  defaultBoardId?: string;
  onSaved: () => void;
}

interface FormState {
  board_id: string;
  title: string;
  description: string;
  source_url: string;
  cost_estimate: string;
  vendor_id: string;
  status: IdeaStatus;
  tags: string[];
  notes: string;
}

function emptyForm(defaultBoardId?: string): FormState {
  return {
    board_id: defaultBoardId ?? '',
    title: '',
    description: '',
    source_url: '',
    cost_estimate: '',
    vendor_id: '',
    status: 'inspiration',
    tags: [],
    notes: '',
  };
}

function toForm(idea: IdeaRow): FormState {
  return {
    board_id: idea.board_id,
    title: idea.title,
    description: idea.description ?? '',
    source_url: idea.source_url ?? '',
    cost_estimate: idea.cost_estimate != null ? String(idea.cost_estimate) : '',
    vendor_id: idea.vendor_id ?? '',
    status: idea.status,
    tags: idea.tags,
    notes: idea.notes ?? '',
  };
}

/** Parses a money field, distinguishing "left blank" (fine — null) from "typed something we
 *  couldn't read" (a validation error) — see `VendorSheet`'s identical helper. */
function readMoneyField(raw: string): { value: number | null; error?: string } {
  const { value, reason } = parseMoneyInput(raw, { allowShorthand: true });
  if (reason === 'unparseable') return { value: null, error: `Could not read "${raw}" as an amount.` };
  return { value };
}

/**
 * Full idea detail: board, title/description, image upload with a signed-URL preview, source
 * link, cost estimate, an optional vendor link, status, tags, notes — and the one real embed of
 * `EntityNotes` this stage wires in (see the file-ownership note in
 * docs/barmitzvah-planner-plan.md §6 stage 9).
 */
export function IdeaSheet({ open, onClose, idea, boards, defaultBoardId, onSaved }: IdeaSheetProps) {
  const { eventId } = useEventContext();
  const { data: vendorsData } = useVendors();
  const vendors = vendorsData ?? [];

  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(idea ? toForm(idea) : emptyForm(defaultBoardId));
    setImagePath(idea?.image_path ?? null);
    setErrors({});
    setTagDraft('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idea]);

  useEffect(() => {
    let cancelled = false;
    if (!imagePath) {
      setImageUrl(null);
      return;
    }
    getSignedIdeaImageUrl(imagePath)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function handleUploadImage(file: File) {
    if (!idea) return;
    setUploading(true);
    try {
      const updated = await uploadIdeaImage(eventId, idea.id, file);
      setImagePath(updated.image_path);
      showToast('Photo added', 'success');
      onSaved();
    } catch {
      showToast('Could not upload that image — please try again.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit() {
    const title = form.title.trim();
    const nextErrors: Record<string, string> = {};
    if (!title) nextErrors.title = 'Give the idea a title.';
    if (!form.board_id) nextErrors.board_id = 'Choose a board.';

    const cost = readMoneyField(form.cost_estimate);
    if (cost.error) nextErrors.cost_estimate = cost.error;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const patch: IdeaInput = {
        board_id: form.board_id,
        title,
        description: form.description.trim() || null,
        source_url: form.source_url.trim() || null,
        cost_estimate: cost.value,
        vendor_id: form.vendor_id || null,
        status: form.status,
        tags: form.tags,
        notes: form.notes.trim() || null,
      };
      if (idea) {
        await updateIdea(idea.id, patch);
      } else {
        await createIdea(eventId, patch);
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
    if (!idea) return;
    const ok = await confirmDialog(`Remove "${idea.title}"?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteIdea(idea.id);
      showToast('Idea removed', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={idea ? idea.title : 'Add idea'}
      anchor="drawer"
      size="lg"
      footer={
        <>
          {idea && (
            <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={deleting || saving} className="mr-auto">
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? 'Removing…' : 'Remove idea'}
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
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Field label="Title" htmlFor="idea-title" required error={errors.title}>
            <Input id="idea-title" value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Board" htmlFor="idea-board" required error={errors.board_id}>
              <Select id="idea-board" value={form.board_id} onChange={(e) => set('board_id', e.target.value)} invalid={!!errors.board_id}>
                <option value="" disabled>
                  Choose a board…
                </option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="idea-status">
              <Select id="idea-status" value={form.status} onChange={(e) => set('status', e.target.value as IdeaStatus)}>
                {IDEA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {IDEA_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="idea-description">
            <Textarea id="idea-description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </Field>
        </div>

        <div className="flex flex-col gap-2 border-t border-separator pt-4">
          <h3 className="text-sm font-semibold text-text-primary">Photo</h3>
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              className="aspect-video w-full rounded-md object-cover"
            />
          )}
          {idea ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadImage(file);
                }}
                aria-label="Upload a photo for this idea"
                className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-separator-control file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-primary hover:file:bg-hover"
              />
              {uploading && <p className="text-xs text-text-muted">Uploading…</p>}
            </>
          ) : (
            <p className="text-xs text-text-muted">Save the idea first, then add a photo.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-separator pt-4">
          <Field label="Source URL" htmlFor="idea-source-url" hint="Where you found it — Pinterest, an Instagram post, a supplier's site">
            <Input id="idea-source-url" type="url" value={form.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://…" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cost estimate" htmlFor="idea-cost" error={errors.cost_estimate}>
              <Input
                id="idea-cost"
                inputMode="decimal"
                value={form.cost_estimate}
                invalid={!!errors.cost_estimate}
                onChange={(e) => set('cost_estimate', e.target.value)}
                onBlur={(e) => set('cost_estimate', normaliseMoneyInput(e.target.value))}
                placeholder="£"
              />
            </Field>
            <Field label="Vendor" htmlFor="idea-vendor" hint="Optional">
              <Select id="idea-vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
                <option value="">No vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <Field label="Tags" className="border-t border-separator pt-4">
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

        <Field label="Notes" htmlFor="idea-notes">
          <Textarea id="idea-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>

        {idea && <EntityNotes entityType="idea" entityId={idea.id} className="border-t border-separator pt-4" />}
      </div>
    </Sheet>
  );
}
