import { useState, type FormEvent } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { updateEvent } from '../../data/event/mutations';
import { toLocalDateOnly } from '../../lib/format';
import { formatHebrewDate } from '../../lib/hebrewDate';
import type { EventRow } from '../../data/event/types';

interface DateVenueSectionProps {
  event: EventRow;
  onSaved: () => void;
}

/** `time` columns round-trip as "HH:MM:SS" — a native time input only wants "HH:MM". */
function timeInputValue(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

export function DateVenueSection({ event, onSaved }: DateVenueSectionProps) {
  const { eventId } = useEventContext();
  const [eventDate, setEventDate] = useState(event.event_date);
  const [hebrewOverride, setHebrewOverride] = useState(event.hebrew_date_override ?? '');
  const [venueName, setVenueName] = useState(event.venue_name ?? '');
  const [venueAddress, setVenueAddress] = useState(event.venue_address ?? '');
  const [ceremonyTime, setCeremonyTime] = useState(timeInputValue(event.ceremony_time));
  const [receptionTime, setReceptionTime] = useState(timeInputValue(event.reception_time));
  const [dinnerTime, setDinnerTime] = useState(timeInputValue(event.dinner_time));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDate = toLocalDateOnly(eventDate);
  const computedHebrew = parsedDate ? formatHebrewDate(parsedDate) : null;
  const hebrewOverrideTrimmed = hebrewOverride.trim();
  const hebrewDisplay = hebrewOverrideTrimmed || computedHebrew || '—';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!eventDate) {
      setError('Pick a date.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateEvent(eventId, {
        event_date: eventDate,
        hebrew_date_override: hebrewOverrideTrimmed || null,
        venue_name: venueName.trim() || null,
        venue_address: venueAddress.trim() || null,
        ceremony_time: ceremonyTime || null,
        reception_time: receptionTime || null,
        dinner_time: dinnerTime || null,
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
        <h2 className="text-base font-semibold text-text-primary">Date &amp; venue</h2>

        <Field label="Event date" htmlFor="settings-event-date" required error={error ?? undefined}>
          <Input
            id="settings-event-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Hebrew date"
            hint={hebrewOverrideTrimmed ? 'Using your override →' : 'Computed automatically'}
          >
            <p className="rounded-md border border-separator-control bg-canvas px-3 py-2 text-sm text-text-secondary">
              {hebrewDisplay}
            </p>
          </Field>
          <Field
            label="Hebrew date override"
            htmlFor="settings-hebrew-override"
            hint="Only if your rabbi's own reckoning differs"
          >
            <Input
              id="settings-hebrew-override"
              value={hebrewOverride}
              onChange={(e) => setHebrewOverride(e.target.value)}
              placeholder="e.g. 3 Cheshvan 5787"
            />
          </Field>
        </div>

        <Field label="Venue name" htmlFor="settings-venue-name">
          <Input id="settings-venue-name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
        </Field>

        <Field label="Venue address" htmlFor="settings-venue-address">
          <Textarea id="settings-venue-address" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ceremony" htmlFor="settings-ceremony-time">
            <Input
              id="settings-ceremony-time"
              type="time"
              value={ceremonyTime}
              onChange={(e) => setCeremonyTime(e.target.value)}
            />
          </Field>
          <Field label="Reception" htmlFor="settings-reception-time">
            <Input
              id="settings-reception-time"
              type="time"
              value={receptionTime}
              onChange={(e) => setReceptionTime(e.target.value)}
            />
          </Field>
          <Field label="Dinner" htmlFor="settings-dinner-time">
            <Input
              id="settings-dinner-time"
              type="time"
              value={dinnerTime}
              onChange={(e) => setDinnerTime(e.target.value)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}
