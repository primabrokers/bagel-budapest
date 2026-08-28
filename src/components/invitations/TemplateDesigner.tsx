import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type TemplateInput,
} from '../../data/invitations/mutations';
import { createDefaultInvitationDesign } from '../../data/invitations/types';
import { generateInvitationDesign } from '../../data/invitations/aiDesign';
import { InvitationRenderer, type InvitationRendererEvent } from './InvitationRenderer';
import type {
  InvitationBlock,
  InvitationBlockKind,
  InvitationDesign,
  InvitationFontFamily,
  InvitationTemplateKind,
  InvitationTemplateRow,
} from '../../data/invitations/types';

interface TemplateDesignerProps {
  open: boolean;
  onClose: () => void;
  /** `null` — adding a new template. */
  template: InvitationTemplateRow | null;
  /** For the live preview and the palette's own fallback — the event's title/name/date/venue and
   *  its Settings → Style palette (see `InvitationRenderer`'s palette-override-falls-back-to-event
   *  note). */
  event: InvitationRendererEvent;
  photoUrl: string | null;
  monogramUrl: string | null;
  onSaved: () => void;
}

const BLOCK_LABELS: Record<InvitationBlockKind, string> = {
  heading: 'Heading',
  names: 'Names',
  hebrew_line: 'Hebrew line',
  date: 'Date',
  venue: 'Venue',
  photo: 'Photo',
  monogram: 'Monogram',
  rsvp_cta: 'RSVP button',
};

const FONT_OPTIONS: { value: InvitationFontFamily; label: string }[] = [
  { value: 'fraunces', label: 'Fraunces (display serif)' },
  { value: 'inter', label: 'Inter (sans)' },
  { value: 'frank-ruhl-libre', label: 'Frank Ruhl Libre (Hebrew serif)' },
];

interface FormState {
  name: string;
  kind: InvitationTemplateKind;
  design: InvitationDesign;
}

function toForm(template: InvitationTemplateRow): FormState {
  return { name: template.name, kind: template.kind, design: template.design };
}

function emptyForm(): FormState {
  return { name: '', kind: 'invitation', design: createDefaultInvitationDesign() };
}

function moveBlock(blocks: InvitationBlock[], index: number, direction: -1 | 1): InvitationBlock[] {
  const target = index + direction;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Add/edit sheet for one `bm_invitation_templates` row — a name and kind, a reorderable block
 * list (toggle each on/off, move up/down; no dnd-kit, per CLAUDE.md), a palette override
 * (falls back to the event's own Settings → Style palette when left blank) and a font pick, with
 * a live `InvitationRenderer` preview reflecting every change immediately.
 */
export function TemplateDesigner({ open, onClose, template, event, photoUrl, monogramUrl, onSaved }: TemplateDesignerProps) {
  const { eventId } = useEventContext();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [primaryHex, setPrimaryHex] = useState('');
  const [accentHex, setAccentHex] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'spec' | 'html'>('spec');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  /** Non-fatal adjustments the validator or sanitiser made — worth showing so a family knows the
   *  saved design is not byte-for-byte what the model produced. */
  const [aiNotes, setAiNotes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const next = template ? toForm(template) : emptyForm();
    setForm(next);
    setPrimaryHex(next.design.paletteOverride?.primaryHex ?? '');
    setAccentHex(next.design.paletteOverride?.accentHex ?? '');
  }, [open, template]);

  function setDesign(patch: Partial<InvitationDesign>) {
    setForm((f) => ({ ...f, design: { ...f.design, ...patch } }));
  }

  function toggleBlock(id: string) {
    setDesign({ blocks: form.design.blocks.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)) });
  }

  function moveBlockAt(index: number, direction: -1 | 1) {
    setDesign({ blocks: moveBlock(form.design.blocks, index, direction) });
  }

  function applyPaletteHex(which: 'primary' | 'accent', raw: string) {
    if (which === 'primary') setPrimaryHex(raw);
    else setAccentHex(raw);
    const nextPrimary = which === 'primary' ? raw : primaryHex;
    const nextAccent = which === 'accent' ? raw : accentHex;
    setDesign({
      paletteOverride: {
        primaryHex: nextPrimary.trim() || undefined,
        accentHex: nextAccent.trim() || undefined,
      },
    });
  }

  async function handleGenerate() {
    const brief = aiPrompt.trim();
    if (!brief || generating) return;

    setGenerating(true);
    setAiError(null);
    setAiNotes([]);
    try {
      const outcome = await generateInvitationDesign({
        eventId,
        prompt: brief,
        mode: aiMode,
        event,
        // Carried so a regenerate keeps the family's own colours and font rather than resetting
        // everything they already chose.
        base: form.design,
      });

      if (!outcome.ok) {
        setAiError(outcome.message);
        return;
      }

      // Applied to the form only — nothing is written until they press Save, so an unwanted
      // design costs nothing but another click.
      setForm((f) => ({ ...f, design: outcome.design }));
      setAiNotes(outcome.notes);
      showToast('Design generated — have a look before saving', 'success');
    } finally {
      setGenerating(false);
    }
  }

  /** Back to the hand-built block layout, keeping the generated design on the row so switching
   *  back and forth does not lose it. */
  function revertToBlocks() {
    setDesign({ mode: 'blocks' });
    setAiNotes([]);
    setAiError(null);
  }

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      showToast('Give the template a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const input: TemplateInput = { name, kind: form.kind, design: form.design };
      if (template) {
        await updateTemplate(template.id, input);
      } else {
        await createTemplate(eventId, input);
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
    if (!template) return;
    const ok = await confirmDialog(`Remove "${template.name}"?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteTemplate(template.id);
      showToast('Template removed', 'success');
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
      title={template ? 'Edit template' : 'Add template'}
      anchor="drawer"
      size="lg"
      footer={
        <>
          {template && (
            <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={deleting || saving} className="mr-auto">
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? 'Removing…' : 'Remove'}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="template-name" required>
            <Input id="template-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Kind" htmlFor="template-kind">
            <Select
              id="template-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as InvitationTemplateKind }))}
            >
              <option value="invitation">Invitation</option>
              <option value="save_the_date">Save the date</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-separator-soft bg-canvas-raised p-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} aria-hidden="true" className="text-plum-700" />
            <p className="text-sm font-medium text-text-secondary">Design with AI</p>
          </div>

          <Field
            label="Describe the look you want"
            htmlFor="ai-brief"
            hint="The date, venue and names are taken from your event — describe style and mood."
          >
            <Textarea
              id="ai-brief"
              rows={3}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Warm and traditional, deep navy and gold, a Star of David above the names."
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Style of design" htmlFor="ai-mode">
              <Select id="ai-mode" value={aiMode} onChange={(e) => setAiMode(e.target.value as 'spec' | 'html')}>
                <option value="spec">Guided — matches the app, prints well</option>
                <option value="html">Free-form — more creative, preview only</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="button" onClick={() => void handleGenerate()} disabled={generating || !aiPrompt.trim()} className="w-full">
                {generating ? 'Designing…' : 'Generate'}
              </Button>
            </div>
          </div>

          {aiError && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-text">
              {aiError}
            </p>
          )}

          {aiNotes.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-text-muted">
              {aiNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          {form.design.mode && form.design.mode !== 'blocks' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>
                Showing the {form.design.mode === 'spec' ? 'guided' : 'free-form'} AI design
                {form.design.generated?.model ? ` (${form.design.generated.model})` : ''}.
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={revertToBlocks}>
                Use the block layout instead
              </Button>
            </div>
          )}

          {form.design.mode === 'html' && (
            <p className="text-xs text-text-muted">
              Free-form designs render in a sandbox and are not included in the printed invitation —
              the block layout is used for printing.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text-secondary">Preview</p>
          <InvitationRenderer
            event={event}
            design={form.design}
            photoUrl={photoUrl}
            monogramUrl={monogramUrl}
            rsvpHref={null}
          />
        </div>

        <div className="border-t border-separator pt-4">
          <p className="mb-2 text-sm font-medium text-text-secondary">Blocks</p>
          <ul className="flex flex-col divide-y divide-separator-soft rounded-md border border-separator-soft">
            {form.design.blocks.map((block, index) => (
              <li key={block.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex shrink-0 flex-col">
                  <IconButton label={`Move ${BLOCK_LABELS[block.kind]} up`} size="sm" disabled={index === 0} onClick={() => moveBlockAt(index, -1)}>
                    <ChevronUp size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Move ${BLOCK_LABELS[block.kind]} down`}
                    size="sm"
                    disabled={index === form.design.blocks.length - 1}
                    onClick={() => moveBlockAt(index, 1)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </IconButton>
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{BLOCK_LABELS[block.kind]}</span>
                <Toggle checked={block.enabled} onChange={() => toggleBlock(block.id)} label={`Show ${BLOCK_LABELS[block.kind]}`} />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 border-t border-separator pt-4">
          <p className="text-sm font-medium text-text-secondary">Appearance</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Primary colour" htmlFor="template-primary-hex" hint="Optional — falls back to the event's own palette">
              <Input
                id="template-primary-hex"
                value={primaryHex}
                onChange={(e) => applyPaletteHex('primary', e.target.value)}
                placeholder={event.palette?.primaryHex ?? '#72386B'}
              />
            </Field>
            <Field label="Accent colour" htmlFor="template-accent-hex" hint="Optional — falls back to the event's own palette">
              <Input
                id="template-accent-hex"
                value={accentHex}
                onChange={(e) => applyPaletteHex('accent', e.target.value)}
                placeholder={event.palette?.accentHex ?? '#856823'}
              />
            </Field>
          </div>
          <Field label="Font" htmlFor="template-font">
            <Select
              id="template-font"
              value={form.design.fontFamily ?? 'fraunces'}
              onChange={(e) => setDesign({ fontFamily: e.target.value as InvitationFontFamily })}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
