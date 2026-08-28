import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { useFunctions } from '../../data/event/hooks';
import { useVendors } from '../../data/vendors/hooks';
import {
  createScheduleItem,
  deleteScheduleItem,
  updateScheduleItem,
  type ScheduleItemInput,
} from '../../data/schedule/mutations';
import { AUDIENCE_LABELS, AUDIENCES } from './audienceMeta';
import type { ScheduleAudience, ScheduleItemRow } from '../../data/schedule/types';

interface ScheduleItemSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — adding a new item. */
  item: ScheduleItemRow | null;
  onSaved: () => void;
}

interface FormState {
  starts_at: string;
  duration_minutes: string;
  activity: string;
  location: string;
  responsible: string;
  function_id: string;
  vendor_id: string;
  audience: ScheduleAudience;
  notes: string;
}

const EMPTY_FORM: FormState = {
  starts_at: '',
  duration_minutes: '',
  activity: '',
  location: '',
  responsible: '',
  function_id: '',
  vendor_id: '',
  audience: 'all',
  notes: '',
};

/** A `timestamptz` from the database to the local `YYYY-MM-DDTHH:mm` a `datetime-local` input
 *  needs, in the viewer's OWN local time — not the UTC-based string `.toISOString()` would give,
 *  which would show the wrong wall-clock time to anyone not on UTC. */
function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The reverse: a `datetime-local` input's value — which the browser parses as LOCAL time, no
 *  timezone attached — to a real ISO timestamp for `starts_at`. */
function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toForm(item: ScheduleItemRow): FormState {
  return {
    starts_at: toDateTimeLocalValue(item.starts_at),
    duration_minutes: item.duration_minutes != null ? String(item.duration_minutes) : '',
    activity: item.activity,
    location: item.location ?? '',
    responsible: item.responsible ?? '',
    function_id: item.function_id ?? '',
    vendor_id: item.vendor_id ?? '',
    audience: item.audience,
    notes: item.notes ?? '',
  };
}

/** Add/edit sheet for one run-sheet item. */
export function ScheduleItemSheet({ open, onClose, item, onSaved }: ScheduleItemSheetProps) {
  const { eventId } = useEventContext();
  const { data: functionsData } = useFunctions();
  const { data: vendorsData } = useVendors();
  const functions = functionsData ?? [];
  const vendors = vendorsData ?? [];

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(item ? toForm(item) : EMPTY_FORM);
    setErrors({});
  }, [open, item]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const activity = form.activity.trim();
    const nextErrors: Record<string, string> = {};
    if (!activity) nextErrors.activity = 'Say what happens at this point.';

    let duration: number | null = null;
    if (form.duration_minutes.trim()) {
      const parsed = Number(form.duration_minutes);
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors.duration_minutes = 'Enter a number of minutes.';
      } else {
        duration = parsed;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const patch: ScheduleItemInput = {
        activity,
        starts_at: fromDateTimeLocalValue(form.starts_at),
        duration_minutes: duration,
        location: form.location.trim() || null,
        responsible: form.responsible.trim() || null,
        function_id: form.function_id || null,
        vendor_id: form.vendor_id || null,
        audience: form.audience,
        notes: form.notes.trim() || null,
      };
      if (item) {
        await updateScheduleItem(item.id, patch);
      } else {
        await createScheduleItem(eventId, patch);
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
    if (!item) return;
    const ok = await confirmDialog(`Remove "${item.activity}" from the run sheet?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteScheduleItem(item.id);
      showToast('Removed from the run sheet', 'success');
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
      title={item ? 'Edit run sheet item' : 'Add run sheet item'}
      anchor="drawer"
      footer={
        <>
          {item && (
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
      <div className="flex flex-col gap-3">
        <Field label="Activity" htmlFor="schedule-activity" required error={errors.activity}>
          <Input id="schedule-activity" value={form.activity} onChange={(e) => set('activity', e.target.value)} invalid={!!errors.activity} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="schedule-starts-at" hint="Optional — leave blank if not yet timed">
            <Input
              id="schedule-starts-at"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => set('starts_at', e.target.value)}
            />
          </Field>
          <Field label="Duration (minutes)" htmlFor="schedule-duration" error={errors.duration_minutes}>
            <Input
              id="schedule-duration"
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={form.duration_minutes}
              invalid={!!errors.duration_minutes}
              onChange={(e) => set('duration_minutes', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Function" htmlFor="schedule-function" hint="Optional — groups this on the run sheet">
          <Select id="schedule-function" value={form.function_id} onChange={(e) => set('function_id', e.target.value)}>
            <option value="">No function</option>
            {functions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Location" htmlFor="schedule-location">
            <Input id="schedule-location" value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Responsible" htmlFor="schedule-responsible" hint="Who's running it">
            <Input id="schedule-responsible" value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
          </Field>
        </div>

        <Field label="Vendor" htmlFor="schedule-vendor" hint="Optional">
          <Select id="schedule-vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
            <option value="">No vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Audience" htmlFor="schedule-audience" hint="Who this line is relevant to">
          <Select id="schedule-audience" value={form.audience} onChange={(e) => set('audience', e.target.value as ScheduleAudience)}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" htmlFor="schedule-notes">
          <Textarea id="schedule-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
