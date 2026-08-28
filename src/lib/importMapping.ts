/**
 * Header-synonym table for `ImportWizard`'s column-mapping step (build plan §3.6) — turns the
 * column headers a family's spreadsheet actually uses ("Given Name", "Mobile", "Family") into
 * this app's own guest/household fields, case-insensitively, so the wizard can pre-fill a mapping
 * a human then only has to correct rather than build from scratch.
 */

export type GuestField =
  | 'household_name'
  | 'first_name'
  | 'last_name'
  | 'guest_type'
  | 'age'
  | 'gender'
  | 'dietary'
  | 'allergies'
  | 'meal_preference'
  | 'email'
  | 'phone'
  | 'whatsapp'
  | 'address_lines'
  | 'postcode'
  | 'category'
  | 'side_of_family'
  | 'notes'
  | 'relationship'
  | 'is_vip';

/** How the wizard turns a flat spreadsheet into households: one new household per row (the
 *  common case for a simple guest list), or every row grouped by a shared household column (a
 *  spreadsheet with one row per PERSON and a repeated "Family"/"Household" column). Recorded
 *  alongside the column mapping so the wizard's preview step knows which grouping it's building. */
export type ImportGroupingMode = 'one_per_row' | 'group_by_column';

export interface ImportMapping {
  /** Source header -> guest/household field, or `null` for "ignore this column". */
  columns: Record<string, GuestField | null>;
  mode: ImportGroupingMode;
  /** The header acting as the household-grouping key when `mode === 'group_by_column'`; `null`
   *  otherwise, and also `null` when no column looked like one even in group mode — the wizard's
   *  own `<Select>` is what lets a human point at one. */
  householdColumn: string | null;
}

const SYNONYMS: Record<GuestField, string[]> = {
  household_name: ['household', 'family', 'household name', 'family name', 'family group', 'group name'],
  first_name: ['first name', 'given name', 'forename', 'firstname', 'guest first name'],
  last_name: ['last name', 'surname', 'family surname', 'lastname', 'guest last name'],
  guest_type: ['guest type', 'type', 'adult/child', 'adult or child', 'adultchild'],
  age: ['age'],
  gender: ['gender', 'sex'],
  dietary: ['dietary', 'diet', 'dietary requirements', 'dietary requirement'],
  allergies: ['allergies', 'allergy'],
  meal_preference: ['meal preference', 'meal', 'meal choice'],
  email: ['email', 'e-mail', 'email address', 'e-mail address'],
  phone: ['phone', 'mobile', 'cell', 'telephone', 'phone number', 'mobile number', 'tel'],
  whatsapp: ['whatsapp', 'whatsapp number'],
  address_lines: ['address', 'address lines', 'street address', 'postal address'],
  postcode: ['postcode', 'post code', 'zip', 'zip code', 'zipcode'],
  category: ['category', 'group'],
  side_of_family: ['side', 'side of family', 'side_of_family', 'family side'],
  notes: ['notes', 'note', 'comments', 'comment'],
  relationship: ['relationship', 'relation', 'relation to family'],
  is_vip: ['vip', 'is vip', 'is_vip'],
};

/** Display order + label for the wizard's per-column `<Select>`. */
export const GUEST_FIELD_LABELS: Record<GuestField, string> = {
  household_name: 'Household name',
  first_name: 'First name',
  last_name: 'Last name',
  guest_type: 'Guest type (adult/child)',
  age: 'Age',
  gender: 'Gender',
  dietary: 'Dietary',
  allergies: 'Allergies',
  meal_preference: 'Meal preference',
  email: 'Email',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  address_lines: 'Address',
  postcode: 'Postcode',
  category: 'Category',
  side_of_family: 'Side of family',
  relationship: 'Relationship',
  is_vip: 'VIP',
  notes: 'Notes',
};

export const GUEST_FIELD_ORDER: GuestField[] = Object.keys(GUEST_FIELD_LABELS) as GuestField[];

function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const SYNONYM_LOOKUP = new Map<string, GuestField>();
for (const field of GUEST_FIELD_ORDER) {
  // The field's own name ("first_name") is a match too, for a spreadsheet exported straight
  // from another database with our own column names.
  SYNONYM_LOOKUP.set(normaliseHeader(field), field);
  for (const synonym of SYNONYMS[field]) {
    SYNONYM_LOOKUP.set(normaliseHeader(synonym), field);
  }
}

/**
 * Pure guess at a mapping from a CSV's header row, for the wizard to pre-fill and a human to
 * correct. The first column to match a field wins it — a spreadsheet should not have two "Email"
 * columns, but if it does, only the first is auto-mapped and the second is left for the human.
 */
export function guessColumnMapping(headers: string[]): Record<string, GuestField | null> {
  const result: Record<string, GuestField | null> = {};
  const claimed = new Set<GuestField>();

  for (const header of headers) {
    const match = SYNONYM_LOOKUP.get(normaliseHeader(header));
    if (match && !claimed.has(match)) {
      result[header] = match;
      claimed.add(match);
    } else {
      result[header] = null;
    }
  }

  return result;
}

/**
 * The wizard's starting mapping state for a freshly-uploaded file: guesses every column, then
 * defaults the grouping mode to `group_by_column` when a household-shaped column was found (a
 * spreadsheet with one row per PERSON) and `one_per_row` otherwise (the common simple case — one
 * row is one household with its one named guest).
 */
export function defaultMapping(headers: string[]): ImportMapping {
  const columns = guessColumnMapping(headers);
  const householdColumn = Object.entries(columns).find(([, field]) => field === 'household_name')?.[0] ?? null;
  return {
    columns,
    mode: householdColumn ? 'group_by_column' : 'one_per_row',
    householdColumn,
  };
}
