import { useState, type FormEvent } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { updateEvent } from '../../data/event/mutations';
import type { EventRow } from '../../data/event/types';

interface IdentitySectionProps {
  event: EventRow;
  onSaved: () => void;
}

/** `title`, `boy_name` (required), `boy_hebrew_name`, `parents_names` — its own local state and
 *  its own Save button, per this page's "small independent forms" convention. */
export function IdentitySection({ event, onSaved }: IdentitySectionProps) {
  const { eventId } = useEventContext();
  const [title, setTitle] = useState(event.title);
  const [boyName, setBoyName] = useState(event.boy_name);
  const [boyHebrewName, setBoyHebrewName] = useState(event.boy_hebrew_name ?? '');
  const [parentsNames, setParentsNames] = useState(event.parents_names ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const trimmedBoyName = boyName.trim();
    if (!trimmedBoyName) {
      setError("The boy's name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateEvent(eventId, {
        title: title.trim() || 'Bar Mitzvah',
        boy_name: trimmedBoyName,
        boy_hebrew_name: boyHebrewName.trim() || null,
        parents_names: parentsNames.trim() || null,
      });
      showToast('Saved', 'success');
      onSaved();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Identity</h2>

        <Field label="Title" htmlFor="settings-title" hint="Shown on invitations and the top bar">
          <Input id="settings-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Boy's name" htmlFor="settings-boy-name" required error={error ?? undefined}>
          <Input
            id="settings-boy-name"
            value={boyName}
            onChange={(e) => setBoyName(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>

        <Field label="Boy's Hebrew name" htmlFor="settings-boy-hebrew-name">
          <Input id="settings-boy-hebrew-name" value={boyHebrewName} onChange={(e) => setBoyHebrewName(e.target.value)} />
        </Field>

        <Field label="Parents' names" htmlFor="settings-parents-names">
          <Input id="settings-parents-names" value={parentsNames} onChange={(e) => setParentsNames(e.target.value)} />
        </Field>

        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}
