import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet, type SheetLayer } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { useFamilyMembers } from '../../data/event/hooks';
import { useVendors } from '../../data/vendors/hooks';
import { useGuestBook } from '../../data/guests/hooks';
import { createTask, deleteTask, updateTask, type TaskInput } from '../../data/tasks/mutations';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from './taskMeta';
import type { TaskPriority, TaskRow, TaskStatus } from '../../data/tasks/types';

interface TaskSheetProps {
  open: boolean;
  onClose: () => void;
  /** Null means "add a task"; otherwise the task being edited. */
  task: TaskRow | null;
  onSaved: () => void;
  /** Pre-fills the vendor link when adding a task from `VendorSheet`'s own "Tasks" section —
   *  ignored once `task` is non-null, since an existing task's own `vendor_id` already won. */
  initialVendorId?: string;
  /** Pass `"raised"` when opening this from inside another sheet (e.g. `VendorSheet`'s "Tasks"
   *  section) — see `ui/Sheet.tsx`'s `LAYER` rungs. Defaults to the base rung, for `TasksPage`'s
   *  own direct use. */
  layer?: SheetLayer;
}

interface TaskFormState {
  title: string;
  category: string;
  owner_member_id: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  vendor_id: string;
  guest_id: string;
  notes: string;
}

const EMPTY_FORM: TaskFormState = {
  title: '',
  category: '',
  owner_member_id: '',
  due_date: '',
  priority: 'medium',
  status: 'todo',
  vendor_id: '',
  guest_id: '',
  notes: '',
};

function rowToForm(task: TaskRow): TaskFormState {
  return {
    title: task.title,
    category: task.category ?? '',
    owner_member_id: task.owner_member_id ?? '',
    due_date: task.due_date ?? '',
    priority: task.priority,
    status: task.status,
    vendor_id: task.vendor_id ?? '',
    guest_id: task.guest_id ?? '',
    notes: task.notes ?? '',
  };
}

/** The task create/edit drawer — title, category, owner, due date, priority, status, and
 *  optional vendor/guest links, plus notes. Doubles as the "add task" form when `task` is null. */
export function TaskSheet({ open, onClose, task, onSaved, initialVendorId, layer }: TaskSheetProps) {
  const { eventId } = useEventContext();
  const { data: members } = useFamilyMembers();
  const { data: vendors } = useVendors();
  const { data: households } = useGuestBook();

  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(task ? rowToForm(task) : { ...EMPTY_FORM, vendor_id: initialVendorId ?? '' });
    setTitleError(undefined);
  }, [open, task, initialVendorId]);

  function set<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const guestOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [];
    for (const household of households ?? []) {
      for (const guest of household.guests) {
        const name = [guest.first_name, guest.last_name].filter(Boolean).join(' ');
        options.push({ id: guest.id, label: `${name} — ${household.name}` });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [households]);

  async function handleSubmit() {
    const title = form.title.trim();
    if (!title) {
      setTitleError('Give the task a title.');
      return;
    }

    setSaving(true);
    try {
      const patch: TaskInput = {
        title,
        category: form.category.trim() || null,
        owner_member_id: form.owner_member_id || null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
        vendor_id: form.vendor_id || null,
        guest_id: form.guest_id || null,
        notes: form.notes.trim() || null,
      };
      if (task) {
        await updateTask(task.id, patch);
      } else {
        await createTask(eventId, patch);
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
    if (!task) return;
    const ok = await confirmDialog(`Remove "${task.title}"?`, {
      body: 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      showToast('Task removed', 'success');
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
      title={task ? 'Edit task' : 'Add task'}
      anchor="drawer"
      layer={layer}
      footer={
        <>
          {task && (
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting || saving}
              className="mr-auto"
            >
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? 'Removing…' : 'Remove task'}
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
        <Field label="Title" htmlFor="task-title" required error={titleError}>
          <Input
            id="task-title"
            value={form.title}
            invalid={!!titleError}
            onChange={(e) => {
              set('title', e.target.value);
              if (titleError) setTitleError(undefined);
            }}
          />
        </Field>

        <Field label="Category" htmlFor="task-category" hint="e.g. Catering, Stationery, Attire">
          <Input id="task-category" value={form.category} onChange={(e) => set('category', e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Owner" htmlFor="task-owner">
            <Select id="task-owner" value={form.owner_member_id} onChange={(e) => set('owner_member_id', e.target.value)}>
              <option value="">Unassigned</option>
              {(members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.invited_email || 'Family member'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="task-due-date">
            <Input id="task-due-date" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Priority" htmlFor="task-priority">
            <Select id="task-priority" value={form.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="task-status">
            <Select id="task-status" value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Linked vendor" htmlFor="task-vendor">
            <Select id="task-vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
              <option value="">None</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Linked guest" htmlFor="task-guest">
            <Select id="task-guest" value={form.guest_id} onChange={(e) => set('guest_id', e.target.value)}>
              <option value="">None</option>
              {guestOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notes" htmlFor="task-notes">
          <Textarea id="task-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
