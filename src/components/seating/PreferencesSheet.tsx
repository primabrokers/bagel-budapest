import { useMemo, useState } from 'react';
import { Heart, ShieldAlert, Trash2, Users } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input, Select } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { deleteSeatingPreference, setSeatingPreference } from '../../data/seating/mutations';
import { guestDisplayName, type GuestIndexEntry } from '../../lib/seating/warnings';
import type { HouseholdWithGuests } from '../../data/guests/types';
import type { PreferenceRule, SeatingPreferenceRow } from '../../data/seating/types';

const RULES: PreferenceRule[] = ['must_together', 'prefer_together', 'keep_apart'];
const RULE_LABELS: Record<PreferenceRule, string> = {
  must_together: 'Must sit together',
  prefer_together: 'Prefer together',
  keep_apart: 'Keep apart',
};
const RULE_ICONS: Record<PreferenceRule, typeof Heart> = {
  must_together: Heart,
  prefer_together: Heart,
  keep_apart: ShieldAlert,
};

interface PreferencesSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  households: HouseholdWithGuests[];
  preferences: SeatingPreferenceRow[];
  guestIndex: Map<string, GuestIndexEntry>;
  onChanged: () => void;
}

/**
 * Manage `bm_seating_preferences` — pick two guests and a rule, with an optional note, plus the
 * list of preferences already set with a delete on each. `warnings.ts`'s
 * `checkPreferenceViolations` is what turns these into an actual warning once a plan seats
 * (or fails to seat) the pair accordingly.
 */
export function PreferencesSheet({ open, onClose, eventId, households, preferences, guestIndex, onChanged }: PreferencesSheetProps) {
  const [guestA, setGuestA] = useState('');
  const [guestB, setGuestB] = useState('');
  const [rule, setRule] = useState<PreferenceRule>('must_together');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const guestOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    for (const household of households) {
      for (const guest of household.guests) {
        rows.push({ id: guest.id, label: `${guestDisplayName(guest)} — ${household.name}` });
      }
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [households]);

  function guestLabel(guestId: string): string {
    const entry = guestIndex.get(guestId);
    return entry ? `${guestDisplayName(entry.guest)} (${entry.household.name})` : 'Unknown guest';
  }

  async function handleAdd() {
    if (!guestA || !guestB) {
      showToast('Choose both guests.', 'error');
      return;
    }
    if (guestA === guestB) {
      showToast('Choose two different guests.', 'error');
      return;
    }
    setSaving(true);
    try {
      await setSeatingPreference(eventId, guestA, guestB, rule, note.trim() || null);
      showToast('Preference saved', 'success');
      setGuestA('');
      setGuestB('');
      setRule('must_together');
      setNote('');
      onChanged();
    } catch {
      showToast('Could not save that preference — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pref: SeatingPreferenceRow) {
    const ok = await confirmDialog('Remove this preference?');
    if (!ok) return;
    setDeletingId(pref.id);
    try {
      await deleteSeatingPreference(pref.id);
      showToast('Removed', 'success');
      onChanged();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Seating preferences" icon={<Users size={16} aria-hidden="true" />} anchor="drawer" size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-separator-soft p-3">
          <p className="text-sm font-medium text-text-secondary">Add a preference</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Guest A" htmlFor="preference-guest-a">
              <Select id="preference-guest-a" value={guestA} onChange={(e) => setGuestA(e.target.value)}>
                <option value="">Choose a guest…</option>
                {guestOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Guest B" htmlFor="preference-guest-b">
              <Select id="preference-guest-b" value={guestB} onChange={(e) => setGuestB(e.target.value)}>
                <option value="">Choose a guest…</option>
                {guestOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Rule" htmlFor="preference-rule">
            <Select id="preference-rule" value={rule} onChange={(e) => setRule(e.target.value as PreferenceRule)}>
              {RULES.map((r) => (
                <option key={r} value={r}>
                  {RULE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="preference-note" hint="Optional">
            <Input id="preference-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="button" size="sm" onClick={() => void handleAdd()} disabled={saving} className="self-start">
            {saving ? 'Saving…' : 'Add preference'}
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text-secondary">Existing preferences</p>
          {preferences.length === 0 ? (
            <EmptyState compact title="No preferences set yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-separator-soft">
              {preferences.map((pref) => {
                const Icon = RULE_ICONS[pref.rule];
                return (
                  <li key={pref.id} className="flex items-start gap-2 py-2.5">
                    <Icon
                      size={15}
                      aria-hidden="true"
                      className={pref.rule === 'keep_apart' ? 'mt-0.5 shrink-0 text-danger-fg' : 'mt-0.5 shrink-0 text-plum-600'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">
                        {guestLabel(pref.guest_a)} <span className="text-text-muted">and</span> {guestLabel(pref.guest_b)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {RULE_LABELS[pref.rule]}
                        {pref.note ? ` — ${pref.note}` : ''}
                      </p>
                    </div>
                    <IconButton
                      label="Remove preference"
                      size="sm"
                      disabled={deletingId === pref.id}
                      onClick={() => void handleDelete(pref)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
