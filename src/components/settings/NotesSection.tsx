import { useState, type FormEvent } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { updateEvent } from '../../data/event/mutations';
import type { EventRow } from '../../data/event/types';

interface NotesSectionProps {
  event: EventRow;
  onSaved: () => void;
}

export function NotesSection({ event, onSaved }: NotesSectionProps) {
  const { eventId } = useEventContext();
  const [notes, setNotes] = useState(event.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateEvent(eventId, { notes: notes.trim() || null });
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
        <h2 className="text-base font-semibold text-text-primary">Notes</h2>
        <Field label="General notes" htmlFor="settings-notes">
          <Textarea
            id="settings-notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth keeping in one place — reminders, ideas, things to check."
          />
        </Field>
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}
