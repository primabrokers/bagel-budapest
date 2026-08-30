import { useRef, useState } from 'react';
import { Trash2, UserPlus, Users, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input, Select } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { GENDER_LABELS, GENDER_VALUES, normaliseGender } from '../../lib/guests/gender';
import { parseVCards, type ParsedContact } from '../../lib/guests/vcard';
import { contactPickerAvailable, pickContacts } from '../../lib/guests/contactPicker';
import {
  blankPerson,
  filledPeople,
  inheritedSurname,
  nextPersonKey,
  updatePerson,
  type PersonDraft,
} from '../../lib/guests/personDraft';
import type { GuestType } from '../../data/guests/types';

/**
 * The people on one household card, entered together.
 *
 * This block exists because adding a family used to cost one save for the card and then a separate
 * nested sheet — and a separate round trip — for every single person, since the guest section could
 * not appear until the household had a real id. A family of five was six saves.
 *
 * Everything here is in service of typing less:
 *   - the surname carries down from the row above, because a household usually shares one
 *   - adult/child and gender are selects, so the common case is a tap rather than typing
 *   - two blank rows to begin with, since a household is rarely one person
 *   - contacts can be pulled in from the phone instead of being retyped at all
 */

/** A contact from the phone or a .vcf, as a row. Gender is left unset: a contacts app does not
 *  record it, and guessing from a first name would be wrong often enough to matter. */
function contactToPerson(contact: ParsedContact): PersonDraft {
  return {
    key: nextPersonKey(),
    firstName: contact.firstName,
    lastName: contact.lastName,
    guestType: 'adult',
    gender: '',
  };
}

interface PeopleRowsProps {
  people: PersonDraft[];
  onChange: (people: PersonDraft[]) => void;
  /** Fired with the first imported contact that has a phone or email, so the household's own blank
   *  contact fields can be filled from it. */
  onContactDetails?: (details: { phone?: string; email?: string; address?: string }) => void;
  /** Heading above the rows. Differs between "who is in this household" and "add more people". */
  title: string;
}

export function PeopleRows({ people, onChange, onContactDetails, title }: PeopleRowsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const canPick = contactPickerAvailable();

  function update(key: string, patch: Partial<PersonDraft>) {
    onChange(updatePerson(people, key, patch));
  }

  function addRow() {
    // The surname of the last person who has one — a new row in the Cohen household is almost
    // always another Cohen, and it stays editable for the ones who are not.
    onChange([...people, blankPerson(inheritedSurname(people))]);
  }

  function removeRow(key: string) {
    const next = people.filter((p) => p.key !== key);
    onChange(next.length > 0 ? next : [blankPerson()]);
  }

  function appendContacts(contacts: ParsedContact[]) {
    if (contacts.length === 0) return;
    const rows = contacts.map(contactToPerson);
    // Imported rows replace the untouched blank scaffolding rather than sitting below it.
    const kept = filledPeople(people);
    onChange([...kept, ...rows]);

    const withDetails = contacts.find((c) => c.phone || c.email || c.address);
    if (withDetails) {
      onContactDetails?.({ phone: withDetails.phone, email: withDetails.email, address: withDetails.address });
    }
    showToast(`Added ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`, 'success');
  }

  async function handlePick() {
    setPicking(true);
    try {
      appendContacts(await pickContacts());
    } catch {
      showToast('Could not open your contacts.', 'error');
    } finally {
      setPicking(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const { contacts, notes } = parseVCards(await file.text());
      for (const note of notes) showToast(note, 'info');
      appendContacts(contacts);
    } catch {
      showToast('Could not read that file.', 'error');
    } finally {
      // Cleared so choosing the same file twice in a row still fires a change event.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-separator pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        <div className="flex flex-wrap gap-2">
          {/* Rendered only where the browser really has it. On an iPhone it is absent, which is
              why the file import beside it is the one that carries the weight. */}
          {canPick && (
            <Button type="button" size="sm" variant="secondary" onClick={() => void handlePick()} disabled={picking}>
              <Users size={14} aria-hidden="true" />
              {picking ? 'Opening…' : 'From contacts'}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} aria-hidden="true" />
            Contacts file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard,text/directory"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <p className="text-xs text-text-muted">
        {canPick
          ? 'Pick from your contacts, or choose a contacts file (.vcf) exported from your phone.'
          : 'On iPhone: Contacts → Lists → hold “All Contacts” → Export, or share one contact, then choose the file here.'}
      </p>

      <ul className="flex flex-col gap-3">
        {people.map((person, index) => (
          <li key={person.key} className="rounded-lg border border-separator-soft bg-canvas-raised p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">Person {index + 1}</span>
              <IconButton
                label={`Remove person ${index + 1}`}
                size="sm"
                onClick={() => removeRow(person.key)}
                disabled={people.length === 1 && !person.firstName.trim()}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label={`First name of person ${index + 1}`}
                placeholder="First name"
                autoComplete="off"
                value={person.firstName}
                onChange={(e) => update(person.key, { firstName: e.target.value })}
              />
              <Input
                aria-label={`Last name of person ${index + 1}`}
                placeholder="Last name"
                autoComplete="off"
                value={person.lastName}
                onChange={(e) => update(person.key, { lastName: e.target.value })}
              />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Select
                aria-label={`Adult or child, person ${index + 1}`}
                value={person.guestType}
                onChange={(e) => update(person.key, { guestType: e.target.value as GuestType })}
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
              </Select>
              <Select
                aria-label={`Gender of person ${index + 1}`}
                value={person.gender}
                onChange={(e) => update(person.key, { gender: normaliseGender(e.target.value) ?? '' })}
              >
                <option value="">Gender…</option>
                {GENDER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {GENDER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
          </li>
        ))}
      </ul>

      <Button type="button" size="sm" variant="secondary" onClick={addRow} className="self-start">
        <UserPlus size={14} aria-hidden="true" />
        Add another person
      </Button>
    </div>
  );
}
