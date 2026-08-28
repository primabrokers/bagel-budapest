import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Sheet } from '../ui/Sheet';
import { Field, Input, Select } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { createFunction, deleteFunction, reorderFunctions, updateFunction } from '../../data/event/mutations';
import { formatDateTime } from '../../lib/format';
import type { FunctionKind, FunctionRow } from '../../data/event/types';

const FUNCTION_KINDS: FunctionKind[] = [
  'friday_night',
  'shabbos_morning',
  'kiddush',
  'lunch',
  'shalosh_seudos',
  'motzei_shabbos',
  'party',
  'other',
];

const FUNCTION_KIND_LABELS: Record<FunctionKind, string> = {
  friday_night: 'Friday night',
  shabbos_morning: 'Shabbos morning',
  kiddush: 'Kiddush',
  lunch: 'Lunch',
  shalosh_seudos: 'Shalosh seudos',
  motzei_shabbos: 'Motzei Shabbos',
  party: 'Party',
  other: 'Other',
};

interface FunctionsEditorProps {
  functions: FunctionRow[];
  onChanged: () => void;
}

interface FunctionFormState {
  name: string;
  kind: FunctionKind;
  starts_at: string;
  ends_at: string;
  location: string;
  dress_code: string;
  hebrew_date_override: string;
}

const EMPTY_FORM: FunctionFormState = {
  name: '',
  kind: 'other',
  starts_at: '',
  ends_at: '',
  location: '',
  dress_code: '',
  hebrew_date_override: '',
};

/** `timestamptz` <-> a `datetime-local` input's "YYYY-MM-DDTHH:MM" value, in the browser's own
 *  local time zone — a function's start/end is a real moment, unlike `bm_events.event_date`. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowToForm(row: FunctionRow): FunctionFormState {
  return {
    name: row.name,
    kind: row.kind,
    starts_at: toDatetimeLocalValue(row.starts_at),
    ends_at: toDatetimeLocalValue(row.ends_at),
    location: row.location ?? '',
    dress_code: row.dress_code ?? '',
    hebrew_date_override: row.hebrew_date_override ?? '',
  };
}

/**
 * The event's function list — Friday night dinner, Shabbos morning, the party, and so on —
 * add/edit/delete plus up-down reordering that persists via `reorderFunctions`.
 */
export function FunctionsEditor({ functions, onChanged }: FunctionsEditorProps) {
  const { eventId } = useEventContext();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FunctionFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: FunctionRow) {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setSheetOpen(true);
  }

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      showToast('Give the function a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const patch = {
        name,
        kind: form.kind,
        starts_at: fromDatetimeLocalValue(form.starts_at),
        ends_at: fromDatetimeLocalValue(form.ends_at),
        location: form.location.trim() || null,
        dress_code: form.dress_code.trim() || null,
        hebrew_date_override: form.hebrew_date_override.trim() || null,
      };
      if (editingId) {
        await updateFunction(editingId, patch);
      } else {
        const nextOrder = functions.length ? Math.max(...functions.map((f) => f.sort_order)) + 1 : 0;
        await createFunction(eventId, { ...patch, sort_order: nextOrder });
      }
      showToast('Saved', 'success');
      setSheetOpen(false);
      onChanged();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: FunctionRow) {
    const ok = await confirmDialog(`Remove "${row.name}"?`, {
      body: 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await deleteFunction(row.id);
      showToast('Removed', 'success');
      onChanged();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= functions.length) return;
    const a = functions[index];
    const b = functions[target];
    setBusyId(a.id);
    try {
      await reorderFunctions([
        { id: a.id, sort_order: b.sort_order },
        { id: b.id, sort_order: a.sort_order },
      ]);
      onChanged();
    } catch {
      showToast('Could not reorder — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">Functions</h2>
        <Button type="button" size="sm" variant="secondary" onClick={openAdd}>
          <Plus size={15} aria-hidden="true" />
          Add function
        </Button>
      </div>

      {functions.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarClock}
          title="No functions yet"
          hint="Add Friday night dinner, Shabbos morning, the party — whatever's on the weekend."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {functions.map((row, index) => (
            <li key={row.id} className="flex items-center gap-2 py-2.5">
              <div className="flex shrink-0 flex-col">
                <IconButton
                  label={`Move ${row.name} up`}
                  size="sm"
                  disabled={index === 0 || busyId !== null}
                  onClick={() => void handleMove(index, -1)}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${row.name} down`}
                  size="sm"
                  disabled={index === functions.length - 1 || busyId !== null}
                  onClick={() => void handleMove(index, 1)}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </IconButton>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
                  <Badge variant="plum">{FUNCTION_KIND_LABELS[row.kind]}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {row.starts_at ? formatDateTime(row.starts_at) : 'No time set'}
                  {row.location ? ` · ${row.location}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <IconButton label={`Edit ${row.name}`} size="sm" onClick={() => openEdit(row)}>
                  <Pencil size={14} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Remove ${row.name}`}
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void handleDelete(row)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingId ? 'Edit function' : 'Add function'}
        anchor="drawer"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Name" htmlFor="function-name" required>
            <Input
              id="function-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Shabbos morning"
            />
          </Field>

          <Field label="Kind" htmlFor="function-kind">
            <Select
              id="function-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as FunctionKind }))}
            >
              {FUNCTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {FUNCTION_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="function-starts">
              <Input
                id="function-starts"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </Field>
            <Field label="Ends" htmlFor="function-ends">
              <Input
                id="function-ends"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Location" htmlFor="function-location">
            <Input
              id="function-location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </Field>

          <Field
            label="Dress code override"
            htmlFor="function-dress-code"
            hint="Leave blank to use the event's dress code"
          >
            <Input
              id="function-dress-code"
              value={form.dress_code}
              onChange={(e) => setForm((f) => ({ ...f, dress_code: e.target.value }))}
            />
          </Field>

          <Field label="Hebrew date override" htmlFor="function-hebrew-override">
            <Input
              id="function-hebrew-override"
              value={form.hebrew_date_override}
              onChange={(e) => setForm((f) => ({ ...f, hebrew_date_override: e.target.value }))}
            />
          </Field>
        </div>
      </Sheet>
    </Card>
  );
}
