import { useEffect, useState } from 'react';
import { Star, Tag as TagIcon, Trash2, type LucideIcon } from 'lucide-react';
import { Sheet, type SheetLayer } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { cn } from '../../lib/cn';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import {
  createGuest,
  deleteGuest,
  setGuestInvited,
  setGuestRsvp,
  setGuestTags,
  updateGuest,
} from '../../data/guests/mutations';
import type { FunctionRow } from '../../data/event/types';
import type { GuestType, GuestWithDetails, MealPreference, RsvpStatus, TagRow } from '../../data/guests/types';
import { GENDER_LABELS, GENDER_VALUES, normaliseGender } from '../../lib/guests/gender';

const GUEST_TYPES: GuestType[] = ['adult', 'child'];
const MEAL_PREFERENCES: MealPreference[] = ['standard', 'vegetarian', 'vegan', 'gluten_free', 'other'];
const MEAL_PREFERENCE_LABELS: Record<MealPreference, string> = {
  standard: 'Standard',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten free',
  other: 'Other',
};
const RSVP_STATUSES: RsvpStatus[] = ['awaiting', 'attending', 'declined', 'unsure'];
const RSVP_LABELS: Record<RsvpStatus, string> = {
  awaiting: 'Awaiting',
  attending: 'Attending',
  declined: 'Declined',
  unsure: 'Unsure',
};

interface GuestFormState {
  first_name: string;
  last_name: string;
  guest_type: GuestType;
  age: string;
  gender: string;
  dietary: string;
  allergies: string;
  meal_preference: MealPreference | '';
  child_meal: boolean;
  high_chair: boolean;
  baby_seat: boolean;
  accessibility: string;
  relationship: string;
  is_vip: boolean;
  notes: string;
}

const EMPTY_FORM: GuestFormState = {
  first_name: '',
  last_name: '',
  guest_type: 'adult',
  age: '',
  gender: '',
  dietary: '',
  allergies: '',
  meal_preference: '',
  child_meal: false,
  high_chair: false,
  baby_seat: false,
  accessibility: '',
  relationship: '',
  is_vip: false,
  notes: '',
};

function toForm(guest: GuestWithDetails): GuestFormState {
  return {
    first_name: guest.first_name,
    last_name: guest.last_name ?? '',
    guest_type: guest.guest_type,
    age: guest.age != null ? String(guest.age) : '',
    gender: guest.gender ?? '',
    dietary: guest.dietary ?? '',
    allergies: guest.allergies ?? '',
    meal_preference: guest.meal_preference ?? '',
    child_meal: guest.child_meal,
    high_chair: guest.high_chair,
    baby_seat: guest.baby_seat,
    accessibility: guest.accessibility ?? '',
    relationship: guest.relationship ?? '',
    is_vip: guest.is_vip,
    notes: guest.notes ?? '',
  };
}

interface GuestSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — creating a new guest in `householdId`. */
  guest: GuestWithDetails | null;
  householdId: string;
  eventId: string;
  tags: TagRow[];
  functions: FunctionRow[];
  onChanged: () => void;
  /** `raised` when opened from inside another Sheet (HouseholdSheet) — see ui/Sheet's LAYER note. */
  layer?: SheetLayer;
}

/**
 * One guest's own fields, plus — once the guest already exists — its tags and per-function
 * invite/RSVP, each saved immediately on change rather than gated behind the form's own Save
 * button. A brand-new guest has no id yet for those join rows to hang off, so that section only
 * appears once the core fields have been saved at least once.
 */
export function GuestSheet({ open, onClose, guest, householdId, eventId, tags, functions, onChanged, layer }: GuestSheetProps) {
  const [form, setForm] = useState<GuestFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(guest ? toForm(guest) : EMPTY_FORM);
  }, [open, guest]);

  async function handleSubmit() {
    const firstName = form.first_name.trim();
    if (!firstName) {
      showToast('Give the guest a first name.', 'error');
      return;
    }
    let age: number | null = null;
    if (form.age.trim()) {
      const parsed = Number(form.age.trim());
      if (!Number.isFinite(parsed)) {
        showToast('Age must be a number.', 'error');
        return;
      }
      age = parsed;
    }

    setSaving(true);
    try {
      const patch = {
        first_name: firstName,
        last_name: form.last_name.trim() || null,
        guest_type: form.guest_type,
        age,
        gender: normaliseGender(form.gender),
        dietary: form.dietary.trim() || null,
        allergies: form.allergies.trim() || null,
        meal_preference: form.meal_preference || null,
        child_meal: form.child_meal,
        high_chair: form.high_chair,
        baby_seat: form.baby_seat,
        accessibility: form.accessibility.trim() || null,
        relationship: form.relationship.trim() || null,
        is_vip: form.is_vip,
        notes: form.notes.trim() || null,
      };
      if (guest) {
        await updateGuest(guest.id, patch);
        showToast('Saved', 'success');
        onChanged();
      } else {
        await createGuest(eventId, householdId, patch);
        showToast('Guest added', 'success');
        onChanged();
        onClose();
      }
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleTag(tagId: string) {
    if (!guest) return;
    const next = guest.tagIds.includes(tagId) ? guest.tagIds.filter((id) => id !== tagId) : [...guest.tagIds, tagId];
    setTagBusy(tagId);
    try {
      await setGuestTags(guest.id, next);
      onChanged();
    } catch {
      showToast('Could not update tags — please try again.', 'error');
    } finally {
      setTagBusy(null);
    }
  }

  async function handleToggleInvited(functionId: string, invited: boolean) {
    if (!guest) return;
    setInviteBusy(functionId);
    try {
      await setGuestInvited(guest.id, functionId, invited);
      onChanged();
    } catch {
      showToast('Could not update the invite — please try again.', 'error');
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleSetRsvp(functionId: string, rsvp: RsvpStatus) {
    if (!guest) return;
    setInviteBusy(functionId);
    try {
      await setGuestRsvp(guest.id, functionId, rsvp);
      onChanged();
    } catch {
      showToast('Could not update the RSVP — please try again.', 'error');
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleDelete() {
    if (!guest) return;
    const ok = await confirmDialog(`Remove ${guest.first_name}${guest.last_name ? ` ${guest.last_name}` : ''}?`, {
      body: 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteGuest(guest.id);
      showToast('Removed', 'success');
      onChanged();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={guest ? guestFullName(guest) : 'Add guest'}
      anchor="drawer"
      layer={layer}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : guest ? 'Save changes' : 'Add guest'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="guest-first-name" required>
            <Input
              id="guest-first-name"
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            />
          </Field>
          <Field label="Last name" htmlFor="guest-last-name">
            <Input
              id="guest-last-name"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="guest-type">
            <Select
              id="guest-type"
              value={form.guest_type}
              onChange={(e) => setForm((f) => ({ ...f, guest_type: e.target.value as GuestType }))}
            >
              {GUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'adult' ? 'Adult' : 'Child'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Age" htmlFor="guest-age" hint="Optional">
            <Input
              id="guest-age"
              inputMode="numeric"
              value={form.age}
              onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Gender" htmlFor="guest-gender" hint="Used to seat either side of a mechitza">
            {/* A select rather than a text box because `autoSeat` matches these exact two values:
                a typed "M" used to leave the guest with no side constraint and nothing to say so. */}
            <Select
              id="guest-gender"
              value={normaliseGender(form.gender) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">Not set</option>
              {GENDER_VALUES.map((value) => (
                <option key={value} value={value}>
                  {GENDER_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Relationship" htmlFor="guest-relationship" hint="e.g. Cousin, School friend">
            <Input
              id="guest-relationship"
              value={form.relationship}
              onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
            />
          </Field>
        </div>

        <Field label="Meal preference" htmlFor="guest-meal-preference">
          <Select
            id="guest-meal-preference"
            value={form.meal_preference}
            onChange={(e) => setForm((f) => ({ ...f, meal_preference: e.target.value as MealPreference | '' }))}
          >
            <option value="">Not set</option>
            {MEAL_PREFERENCES.map((m) => (
              <option key={m} value={m}>
                {MEAL_PREFERENCE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dietary" htmlFor="guest-dietary">
            <Input id="guest-dietary" value={form.dietary} onChange={(e) => setForm((f) => ({ ...f, dietary: e.target.value }))} />
          </Field>
          <Field label="Allergies" htmlFor="guest-allergies">
            <Input
              id="guest-allergies"
              value={form.allergies}
              onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
            />
          </Field>
        </div>

        <Field label="Accessibility needs" htmlFor="guest-accessibility">
          <Input
            id="guest-accessibility"
            value={form.accessibility}
            onChange={(e) => setForm((f) => ({ ...f, accessibility: e.target.value }))}
          />
        </Field>

        <div className="flex flex-col gap-2 rounded-lg border border-separator-soft px-3 py-2.5">
          <ToggleRow label="Child meal" checked={form.child_meal} onChange={(v) => setForm((f) => ({ ...f, child_meal: v }))} />
          <ToggleRow label="High chair" checked={form.high_chair} onChange={(v) => setForm((f) => ({ ...f, high_chair: v }))} />
          <ToggleRow label="Baby seat" checked={form.baby_seat} onChange={(v) => setForm((f) => ({ ...f, baby_seat: v }))} />
          <ToggleRow label="VIP" icon={Star} checked={form.is_vip} onChange={(v) => setForm((f) => ({ ...f, is_vip: v }))} />
        </div>

        <Field label="Notes" htmlFor="guest-notes">
          <Textarea id="guest-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>

        {guest ? (
          <>
            <div className="border-t border-separator pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <TagIcon size={14} aria-hidden="true" />
                Tags
              </p>
              {tags.length === 0 ? (
                <p className="text-xs text-text-muted">No tags yet — add one from &ldquo;Manage tags&rdquo;.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const active = guest.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={tagBusy === tag.id}
                        onClick={() => void handleToggleTag(tag.id)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 disabled:opacity-50',
                          active
                            ? 'border-plum-700 bg-plum-50 text-plum-800'
                            : 'border-separator-control bg-surface text-text-secondary hover:bg-hover',
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {functions.length > 0 && (
              <div className="border-t border-separator pt-3">
                <p className="mb-2 text-sm font-medium text-text-secondary">Functions</p>
                <ul className="flex flex-col gap-2">
                  {functions.map((fn) => {
                    const invite = guest.functionInvites.find((i) => i.function_id === fn.id);
                    const invited = invite?.invited ?? false;
                    const rsvp = invite?.rsvp ?? 'awaiting';
                    const busy = inviteBusy === fn.id;
                    return (
                      <li key={fn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-separator-soft px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{fn.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Toggle
                            label={`Invite ${guestFullName(guest)} to ${fn.name}`}
                            checked={invited}
                            disabled={busy}
                            onChange={(v) => void handleToggleInvited(fn.id, v)}
                          />
                          <Select
                            aria-label={`RSVP for ${fn.name}`}
                            value={rsvp}
                            disabled={!invited || busy}
                            onChange={(e) => void handleSetRsvp(fn.id, e.target.value as RsvpStatus)}
                            className="w-auto min-w-[120px] py-1.5 text-xs"
                          >
                            {RSVP_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {RSVP_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="border-t border-separator pt-3">
              <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete()} disabled={saving}>
                <Trash2 size={14} aria-hidden="true" />
                Remove guest
              </Button>
            </div>
          </>
        ) : (
          <p className="border-t border-separator pt-3 text-xs text-text-muted">
            Save this guest first to add tags and set their RSVP per function.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function guestFullName(guest: { first_name: string; last_name: string | null }): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

function ToggleRow({
  label,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm text-text-secondary">
        {Icon && <Icon size={14} aria-hidden="true" />}
        {label}
      </span>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
