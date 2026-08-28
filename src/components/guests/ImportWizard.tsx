import { useState, type ChangeEvent } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Select, Textarea } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { parseCsv, sniffDelimiter, toRecords } from '../../lib/csv';
import {
  defaultMapping,
  GUEST_FIELD_LABELS,
  GUEST_FIELD_ORDER,
  type GuestField,
  type ImportMapping,
} from '../../lib/importMapping';
import { findDuplicate, findGuestDuplicateInHousehold } from '../../lib/importDedupe';
import type { DuplicateMatch, ExistingGuestName, ExistingHousehold } from '../../lib/importDedupe';
import { createGuest, createHousehold } from '../../data/guests/mutations';
import type { GuestType, HouseholdWithGuests, MealPreference, SideOfFamily } from '../../data/guests/types';

type WizardStep = 1 | 2 | 3;
type RowAction = 'create' | 'merge' | 'skip';

const MEAL_PREFERENCE_VALUES: MealPreference[] = ['standard', 'vegetarian', 'vegan', 'gluten_free', 'other'];
const SIDE_VALUES: SideOfFamily[] = ['father', 'mother', 'both', 'friends', 'community', 'other'];
const DELIMITER_LABELS: Record<',' | ';' | '\t', string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab' };

interface ImportGuestRow {
  first_name: string;
  last_name: string | null;
  guest_type: GuestType;
  age: number | null;
  gender: string | null;
  dietary: string | null;
  allergies: string | null;
  meal_preference: MealPreference | null;
  relationship: string | null;
  is_vip: boolean;
  notes: string | null;
}

interface ImportGroup {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_lines: string | null;
  postcode: string | null;
  category: string | null;
  side_of_family: SideOfFamily | null;
  guests: ImportGuestRow[];
  duplicate: DuplicateMatch<ExistingHousehold> | null;
  action: RowAction;
}

/** First header claiming each field — a human correcting the guess in step 2 could in principle
 *  point two headers at the same field, in which case the first (left-most) one wins. */
function invertMapping(mapping: ImportMapping): Partial<Record<GuestField, string>> {
  const out: Partial<Record<GuestField, string>> = {};
  for (const [header, field] of Object.entries(mapping.columns)) {
    if (field && !out[field]) out[field] = header;
  }
  return out;
}

function buildGroups(
  records: Record<string, string>[],
  mapping: ImportMapping,
  existingHouseholds: ExistingHousehold[],
): ImportGroup[] {
  const fieldToHeader = invertMapping(mapping);
  const get = (record: Record<string, string>, field: GuestField): string => {
    const header = fieldToHeader[field];
    return header ? (record[header] ?? '').trim() : '';
  };

  const groupsByKey = new Map<string, ImportGroup>();
  const order: string[] = [];

  records.forEach((record, index) => {
    const firstName = get(record, 'first_name');
    if (!firstName) return; // nothing recognisable as a name — this row contributes no guest

    const rawAge = get(record, 'age');
    const parsedAge = rawAge ? Number(rawAge) : NaN;
    const rawMeal = get(record, 'meal_preference').toLowerCase().replace(/\s+/g, '_');
    const rawSide = get(record, 'side_of_family').toLowerCase();

    const guest: ImportGuestRow = {
      first_name: firstName,
      last_name: get(record, 'last_name') || null,
      guest_type: get(record, 'guest_type').trim().toLowerCase().startsWith('c') ? 'child' : 'adult',
      age: Number.isFinite(parsedAge) ? parsedAge : null,
      gender: get(record, 'gender') || null,
      dietary: get(record, 'dietary') || null,
      allergies: get(record, 'allergies') || null,
      meal_preference: MEAL_PREFERENCE_VALUES.find((m) => m === rawMeal) ?? null,
      relationship: get(record, 'relationship') || null,
      is_vip: /^(y|yes|true|1|vip)$/i.test(get(record, 'is_vip')),
      notes: get(record, 'notes') || null,
    };

    const groupingColumnValue =
      mapping.mode === 'group_by_column' && mapping.householdColumn ? (record[mapping.householdColumn] ?? '').trim() : '';
    const key = groupingColumnValue || `row-${index}`;

    let group = groupsByKey.get(key);
    if (!group) {
      const householdName =
        get(record, 'household_name') || groupingColumnValue || [guest.first_name, guest.last_name].filter(Boolean).join(' ');
      group = {
        key,
        name: householdName,
        email: get(record, 'email') || null,
        phone: get(record, 'phone') || null,
        whatsapp: get(record, 'whatsapp') || null,
        address_lines: get(record, 'address_lines') || null,
        postcode: get(record, 'postcode') || null,
        category: get(record, 'category') || null,
        side_of_family: SIDE_VALUES.find((s) => s === rawSide) ?? null,
        guests: [],
        duplicate: null,
        action: 'create',
      };
      groupsByKey.set(key, group);
      order.push(key);
    }
    group.guests.push(guest);
  });

  const groups = order.map((k) => groupsByKey.get(k)!);
  for (const group of groups) {
    const duplicate = findDuplicate({ name: group.name, email: group.email, phone: group.phone }, existingHouseholds);
    group.duplicate = duplicate;
    // A confident exact match (shared email/phone) defaults to skip, since re-importing the same
    // household is almost always accidental; a merely possible (name-only) match still defaults
    // to create — the family reviews and can switch it to merge or skip themselves.
    group.action = duplicate?.kind === 'exact' ? 'skip' : 'create';
  }
  return groups;
}

interface ImportOutcome {
  createdHouseholds: number;
  createdGuests: number;
  skippedGuests: number;
  failedGroups: number;
}

async function runImport(groups: ImportGroup[], eventId: string, households: HouseholdWithGuests[]): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { createdHouseholds: 0, createdGuests: 0, skippedGuests: 0, failedGroups: 0 };

  for (const group of groups) {
    if (group.action === 'skip') continue;
    try {
      let householdId: string;
      let existingGuestNames: ExistingGuestName[] = [];

      if (group.action === 'merge' && group.duplicate) {
        householdId = group.duplicate.match.id;
        const target = households.find((h) => h.id === householdId);
        existingGuestNames = target?.guests.map((g) => ({ id: g.id, first_name: g.first_name, last_name: g.last_name })) ?? [];
      } else {
        const created = await createHousehold(eventId, {
          name: group.name,
          email: group.email,
          phone: group.phone,
          whatsapp: group.whatsapp,
          address_lines: group.address_lines,
          postcode: group.postcode,
          category: group.category,
          side_of_family: group.side_of_family,
        });
        householdId = created.id;
        outcome.createdHouseholds += 1;
      }

      for (const guest of group.guests) {
        if (group.action === 'merge') {
          const dup = findGuestDuplicateInHousehold(guest, existingGuestNames);
          if (dup) {
            outcome.skippedGuests += 1;
            continue;
          }
        }
        await createGuest(eventId, householdId, guest);
        outcome.createdGuests += 1;
      }
    } catch {
      outcome.failedGroups += 1;
    }
  }

  return outcome;
}

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  households: HouseholdWithGuests[];
  onChanged: () => void;
}

/**
 * The 3-step CSV import flow (build plan §3.6): paste/upload + delimiter, column mapping with an
 * auto-guessed starting point, then a preview with per-household duplicate flags and a
 * skip/merge/create choice before the final import runs sequentially.
 */
export function ImportWizard({ open, onClose, eventId, households, onChanged }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [rawText, setRawText] = useState('');
  const [delimiterOverride, setDelimiterOverride] = useState<',' | ';' | '\t' | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ columns: {}, mode: 'one_per_row', householdColumn: null });
  const [sampleRow, setSampleRow] = useState<string[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [importing, setImporting] = useState(false);

  const existingHouseholds: ExistingHousehold[] = households.map((h) => ({ id: h.id, name: h.name, email: h.email, phone: h.phone }));

  function reset() {
    setStep(1);
    setRawText('');
    setDelimiterOverride(null);
    setMapping({ columns: {}, mode: 'one_per_row', householdColumn: null });
    setSampleRow([]);
    setGroups([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setRawText(reader.result);
    };
    reader.onerror = () => showToast('Could not read that file — please try again.', 'error');
    reader.readAsText(file);
  }

  function goToMapping() {
    if (!rawText.trim()) {
      showToast('Paste or upload a CSV first.', 'error');
      return;
    }
    const delimiter = delimiterOverride ?? sniffDelimiter(rawText);
    const { headers, rows } = parseCsv(rawText, delimiter);
    if (headers.length === 0 || rows.length === 0) {
      showToast('Could not find any rows in that file.', 'error');
      return;
    }
    setMapping(defaultMapping(headers));
    setSampleRow(rows[0]);
    setStep(2);
  }

  function goToPreview() {
    if (mapping.mode === 'group_by_column' && !mapping.householdColumn) {
      showToast('Pick which column groups rows into a household, or switch to one household per row.', 'error');
      return;
    }
    const hasFirstName = Object.values(mapping.columns).includes('first_name');
    if (!hasFirstName) {
      showToast('Map a column to "First name" — every guest needs one.', 'error');
      return;
    }
    const delimiter = delimiterOverride ?? sniffDelimiter(rawText);
    const { headers, rows } = parseCsv(rawText, delimiter);
    const records = toRecords(headers, rows);
    setGroups(buildGroups(records, mapping, existingHouseholds));
    setStep(3);
  }

  function setGroupAction(key: string, action: RowAction) {
    setGroups((current) => current.map((g) => (g.key === key ? { ...g, action } : g)));
  }

  async function handleImport() {
    const toImport = groups.filter((g) => g.action !== 'skip');
    if (toImport.length === 0) {
      showToast('Nothing selected to import.', 'error');
      return;
    }
    setImporting(true);
    try {
      const outcome = await runImport(groups, eventId, households);
      onChanged();
      const parts = [`${outcome.createdGuests} guest${outcome.createdGuests === 1 ? '' : 's'} imported`];
      if (outcome.createdHouseholds > 0) parts.push(`${outcome.createdHouseholds} new household${outcome.createdHouseholds === 1 ? '' : 's'}`);
      if (outcome.skippedGuests > 0) parts.push(`${outcome.skippedGuests} duplicate guest${outcome.skippedGuests === 1 ? '' : 's'} skipped`);
      if (outcome.failedGroups > 0) parts.push(`${outcome.failedGroups} household${outcome.failedGroups === 1 ? '' : 's'} failed`);
      showToast(parts.join(', '), outcome.failedGroups > 0 ? 'error' : 'success');
      handleClose();
    } catch {
      showToast('Import failed — please try again.', 'error');
    } finally {
      setImporting(false);
    }
  }

  const totalGuestsToImport = groups.filter((g) => g.action !== 'skip').reduce((sum, g) => sum + g.guests.length, 0);
  const headers = Object.keys(mapping.columns);

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Import guests"
      icon={<FileUp size={16} aria-hidden="true" />}
      description={`Step ${step} of 3`}
      anchor="drawer"
      size="xl"
      footer={
        step === 1 ? (
          <>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={goToMapping}>
              Next
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={goToPreview}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={importing}>
              Back
            </Button>
            <Button type="button" onClick={() => void handleImport()} disabled={importing || totalGuestsToImport === 0}>
              {importing ? 'Importing…' : `Import ${totalGuestsToImport} guest${totalGuestsToImport === 1 ? '' : 's'}`}
            </Button>
          </>
        )
      }
    >
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <Field label="Paste your spreadsheet's CSV" htmlFor="import-paste" hint="Copy from Excel/Google Sheets and paste here, or upload a file below.">
            <Textarea
              id="import-paste"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={10}
              className="min-h-[220px] font-mono text-xs"
              placeholder="First Name,Last Name,Email,Mobile&#10;Sarah,Cohen,sarah@example.com,07700 900123"
            />
          </Field>

          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 self-start rounded-md border border-separator-control bg-surface px-3 py-1.5 text-sm text-text-primary hover:bg-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-plum-400">
            <Upload size={14} aria-hidden="true" />
            Upload a CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
          </label>

          <Field label="Delimiter" htmlFor="import-delimiter" hint="Auto-detect works for most files.">
            <Select
              id="import-delimiter"
              value={delimiterOverride ?? 'auto'}
              onChange={(e) => setDelimiterOverride(e.target.value === 'auto' ? null : (e.target.value as ',' | ';' | '\t'))}
            >
              <option value="auto">Auto-detect{rawText.trim() ? ` (${DELIMITER_LABELS[sniffDelimiter(rawText)]})` : ''}</option>
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value="\t">Tab</option>
            </Select>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Field label="How should rows become households?" htmlFor="import-mode">
            <Select
              id="import-mode"
              value={mapping.mode}
              onChange={(e) =>
                setMapping((m) => ({ ...m, mode: e.target.value as ImportMapping['mode'] }))
              }
            >
              <option value="one_per_row">One household per row</option>
              <option value="group_by_column">Group rows by a column (one row per person)</option>
            </Select>
          </Field>

          {mapping.mode === 'group_by_column' && (
            <Field label="Household column" htmlFor="import-household-column">
              <Select
                id="import-household-column"
                value={mapping.householdColumn ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, householdColumn: e.target.value || null }))}
              >
                <option value="">Choose a column…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="border-t border-separator pt-3">
            <p className="mb-2 text-sm font-medium text-text-secondary">Column mapping</p>
            <ul className="flex flex-col divide-y divide-separator-soft">
              {headers.map((header, i) => (
                <li key={header} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{header}</p>
                    {sampleRow[i] && <p className="truncate text-xs text-text-muted">e.g. {sampleRow[i]}</p>}
                  </div>
                  <Select
                    aria-label={`Field for column ${header}`}
                    value={mapping.columns[header] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        columns: { ...m.columns, [header]: (e.target.value || null) as GuestField | null },
                      }))
                    }
                    className="w-auto min-w-[180px]"
                  >
                    <option value="">Ignore this column</option>
                    {GUEST_FIELD_ORDER.map((field) => (
                      <option key={field} value={field}>
                        {GUEST_FIELD_LABELS[field]}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Review each household below. A duplicate warning means an existing household shares its email, phone, or name —
            choose to skip it, merge the new guests into the existing household, or create it anyway.
          </p>
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.key} className="rounded-lg border border-separator-soft p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{group.name}</p>
                    <p className="text-xs text-text-muted">
                      {group.guests.length} guest{group.guests.length === 1 ? '' : 's'}:{' '}
                      {group.guests.map((g) => [g.first_name, g.last_name].filter(Boolean).join(' ')).join(', ')}
                    </p>
                    {group.duplicate && (
                      <Badge variant={group.duplicate.kind === 'exact' ? 'danger' : 'warning'} className="mt-1">
                        {group.duplicate.kind === 'exact' ? 'Exact match' : 'Possible match'}: {group.duplicate.match.name}
                      </Badge>
                    )}
                  </div>
                  <Select
                    aria-label={`Action for ${group.name}`}
                    value={group.action}
                    onChange={(e) => setGroupAction(group.key, e.target.value as RowAction)}
                    className="w-auto min-w-[140px] shrink-0"
                  >
                    <option value="create">Create new</option>
                    <option value="merge" disabled={!group.duplicate}>
                      Merge into match
                    </option>
                    <option value="skip">Skip</option>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
          {groups.length === 0 && <p className="text-sm text-text-muted">No rows produced a guest — check the column mapping.</p>}
        </div>
      )}
    </Sheet>
  );
}
