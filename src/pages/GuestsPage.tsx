import { useMemo, useState } from 'react';
import { Download, MoreVertical, Pencil, Plus, Tags, Trash2, Upload, Users } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Field, Input, Select } from '../components/ui/Field';
import { Menu } from '../components/ui/Menu';
import { cn } from '../lib/cn';
import { showToast } from '../hooks/useToast';
import { confirmDialog } from '../hooks/useConfirm';
import { useEventContext } from '../data/event/context';
import { useFunctions } from '../data/event/hooks';
import { useGuestBook, useTags } from '../data/guests/hooks';
import { deleteGuest } from '../data/guests/mutations';
import { downloadCsv } from '../lib/exportCsv';
import { HouseholdSheet } from '../components/guests/HouseholdSheet';
import { GuestSheet } from '../components/guests/GuestSheet';
import { TagManager } from '../components/guests/TagManager';
import { ImportWizard } from '../components/guests/ImportWizard';
import { BulkBar } from '../components/guests/BulkBar';
import type { FunctionRow } from '../data/event/types';
import type { GuestWithDetails, HouseholdWithGuests, RsvpStatus, SideOfFamily, TagRow } from '../data/guests/types';

const SIDE_LABELS: Record<SideOfFamily, string> = {
  father: "Father's side",
  mother: "Mother's side",
  both: 'Both sides',
  friends: 'Friends',
  community: 'Community',
  other: 'Other',
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  awaiting: 'Awaiting',
  attending: 'Attending',
  declined: 'Declined',
  unsure: 'Unsure',
};

const RSVP_CHIP_STYLES: Record<RsvpStatus, string> = {
  attending: 'bg-success-bg text-success-text',
  declined: 'bg-danger-bg text-danger-text',
  awaiting: 'bg-canvas text-text-muted',
  unsure: 'bg-warning-bg text-warning-text',
};

type SortMode = 'name_asc' | 'name_desc' | 'guests_desc';

function guestFullName(guest: { first_name: string; last_name: string | null }): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

export function GuestsPage() {
  const { eventId } = useEventContext();
  const { data: householdsData, loading, reload } = useGuestBook();
  const { data: tagsData } = useTags();
  const { data: functionsData } = useFunctions();

  // Memoized: this array is a dependency of the useMemo hooks below, and a fresh `?? []` literal
  // on every render would make those recompute every render regardless of whether the data
  // actually changed.
  const households = useMemo(() => householdsData ?? [], [householdsData]);
  const tags = tagsData ?? [];
  const functions = functionsData ?? [];

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState('');
  const [functionFilter, setFunctionFilter] = useState('');
  const [sort, setSort] = useState<SortMode>('name_asc');

  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());

  const [householdSheetState, setHouseholdSheetState] = useState<{ id: string | 'new' } | null>(null);
  const [guestSheetState, setGuestSheetState] = useState<{ householdId: string; guestId: string | null } | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(households.map((h) => h.category).filter((c): c is string => !!c))).sort(),
    [households],
  );

  const filteredHouseholds = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matches = (household: HouseholdWithGuests): boolean => {
      if (sideFilter && household.side_of_family !== sideFilter) return false;
      if (categoryFilter && household.category !== categoryFilter) return false;
      if (tagFilter) {
        const hasTag = household.tagIds.includes(tagFilter) || household.guests.some((g) => g.tagIds.includes(tagFilter));
        if (!hasTag) return false;
      }
      if (rsvpFilter) {
        const hasRsvp = household.guests.some((g) =>
          g.functionInvites.some(
            (inv) => inv.invited && inv.rsvp === rsvpFilter && (!functionFilter || inv.function_id === functionFilter),
          ),
        );
        if (!hasRsvp) return false;
      } else if (functionFilter) {
        const hasFunction = household.guests.some((g) => g.functionInvites.some((inv) => inv.invited && inv.function_id === functionFilter));
        if (!hasFunction) return false;
      }
      if (q) {
        const householdMatch = [household.name, household.email, household.phone, household.postcode].some((v) =>
          v?.toLowerCase().includes(q),
        );
        const guestMatch = household.guests.some((g) => guestFullName(g).toLowerCase().includes(q));
        if (!householdMatch && !guestMatch) return false;
      }
      return true;
    };

    const result = households.filter(matches);
    result.sort((a, b) => {
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'guests_desc') return b.guests.length - a.guests.length;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [households, search, tagFilter, sideFilter, categoryFilter, rsvpFilter, functionFilter, sort]);

  const totalGuests = households.reduce((sum, h) => sum + h.guests.length, 0);

  const openHousehold =
    householdSheetState && householdSheetState.id !== 'new'
      ? (households.find((h) => h.id === householdSheetState.id) ?? null)
      : null;

  const guestSheetHousehold = guestSheetState ? (households.find((h) => h.id === guestSheetState.householdId) ?? null) : null;
  const openGuest =
    guestSheetState && guestSheetHousehold ? (guestSheetHousehold.guests.find((g) => g.id === guestSheetState.guestId) ?? null) : null;

  function toggleGuestSelected(id: string) {
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleHouseholdSelected(household: HouseholdWithGuests) {
    if (household.guests.length === 0) return;
    const allSelected = household.guests.every((g) => selectedGuestIds.has(g.id));
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      household.guests.forEach((g) => {
        if (allSelected) next.delete(g.id);
        else next.add(g.id);
      });
      return next;
    });
  }

  function clearSelection() {
    setSelectedGuestIds(new Set());
  }

  async function handleDeleteGuest(guest: GuestWithDetails) {
    const ok = await confirmDialog(`Remove ${guestFullName(guest)}?`, {
      body: 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await deleteGuest(guest.id);
      showToast('Removed', 'success');
      reload();
      setSelectedGuestIds((current) => {
        const next = new Set(current);
        next.delete(guest.id);
        return next;
      });
    } catch {
      showToast('Could not remove — please try again.', 'error');
    }
  }

  function handleExport() {
    const headers = [
      'Household',
      'First name',
      'Last name',
      'Type',
      'Age',
      'Gender',
      'Dietary',
      'Allergies',
      'Meal preference',
      'Relationship',
      'VIP',
      'Household email',
      'Household phone',
      'Household WhatsApp',
      'Category',
      'Side of family',
      ...functions.map((fn) => `RSVP: ${fn.name}`),
    ];
    const rows = households.flatMap((household) =>
      household.guests.map((guest) => [
        household.name,
        guest.first_name,
        guest.last_name ?? '',
        guest.guest_type,
        guest.age ?? '',
        guest.gender ?? '',
        guest.dietary ?? '',
        guest.allergies ?? '',
        guest.meal_preference ?? '',
        guest.relationship ?? '',
        guest.is_vip ? 'Yes' : '',
        household.email ?? '',
        household.phone ?? '',
        household.whatsapp ?? '',
        household.category ?? '',
        household.side_of_family ?? '',
        ...functions.map((fn) => {
          const invite = guest.functionInvites.find((i) => i.function_id === fn.id);
          return invite?.invited ? RSVP_LABELS[invite.rsvp] : '';
        }),
      ]),
    );
    downloadCsv('guests.csv', headers, rows);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <PageHeader
        title="Guests"
        subtitle={`${totalGuests} guest${totalGuests === 1 ? '' : 's'} across ${households.length} household${households.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setTagManagerOpen(true)}>
              <Tags size={15} aria-hidden="true" />
              Manage tags
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={15} aria-hidden="true" />
              Import
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleExport} disabled={households.length === 0}>
              <Download size={15} aria-hidden="true" />
              Export
            </Button>
            <Button type="button" size="sm" onClick={() => setHouseholdSheetState({ id: 'new' })}>
              <Plus size={15} aria-hidden="true" />
              Add household
            </Button>
          </>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <div className="w-48 shrink-0">
          <Field label="Search" htmlFor="guest-search" className="gap-1">
            <Input
              id="guest-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, household, email…"
            />
          </Field>
        </div>
        <div className="w-36 shrink-0">
          <Field label="Tag" htmlFor="guest-filter-tag" className="gap-1">
            <Select id="guest-filter-tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40 shrink-0">
          <Field label="Side" htmlFor="guest-filter-side" className="gap-1">
            <Select id="guest-filter-side" value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}>
              <option value="">All sides</option>
              {(Object.keys(SIDE_LABELS) as SideOfFamily[]).map((s) => (
                <option key={s} value={s}>
                  {SIDE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {categories.length > 0 && (
          <div className="w-36 shrink-0">
            <Field label="Category" htmlFor="guest-filter-category" className="gap-1">
              <Select id="guest-filter-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <div className="w-36 shrink-0">
          <Field label="RSVP" htmlFor="guest-filter-rsvp" className="gap-1">
            <Select id="guest-filter-rsvp" value={rsvpFilter} onChange={(e) => setRsvpFilter(e.target.value)}>
              <option value="">All RSVP</option>
              {(Object.keys(RSVP_LABELS) as RsvpStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RSVP_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {functions.length > 0 && (
          <div className="w-40 shrink-0">
            <Field label="Function" htmlFor="guest-filter-function" className="gap-1">
              <Select id="guest-filter-function" value={functionFilter} onChange={(e) => setFunctionFilter(e.target.value)}>
                <option value="">All functions</option>
                {functions.map((fn) => (
                  <option key={fn.id} value={fn.id}>
                    {fn.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <div className="w-44 shrink-0">
          <Field label="Sort" htmlFor="guest-sort" className="gap-1">
            <Select id="guest-sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="name_asc">Household A–Z</option>
              <option value="name_desc">Household Z–A</option>
              <option value="guests_desc">Most guests first</option>
            </Select>
          </Field>
        </div>
      </div>

      {loading && !householdsData ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredHouseholds.length === 0 ? (
        <EmptyState
          icon={Users}
          title={households.length === 0 ? 'No guests yet' : 'No guests match your filters'}
          hint={households.length === 0 ? 'Add your first household to get started.' : 'Try clearing a filter or search term.'}
          action={
            households.length === 0 ? (
              <Button type="button" onClick={() => setHouseholdSheetState({ id: 'new' })}>
                Add household
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('flex flex-col gap-3', selectedGuestIds.size > 0 && 'pb-20')}>
          {filteredHouseholds.map((household) => (
            <HouseholdCard
              key={household.id}
              household={household}
              tags={tags}
              functions={functions}
              selectedGuestIds={selectedGuestIds}
              onToggleGuest={toggleGuestSelected}
              onToggleHousehold={toggleHouseholdSelected}
              onEditHousehold={() => setHouseholdSheetState({ id: household.id })}
              onAddGuest={() => setGuestSheetState({ householdId: household.id, guestId: null })}
              onEditGuest={(guest) => setGuestSheetState({ householdId: household.id, guestId: guest.id })}
              onDeleteGuest={(guest) => void handleDeleteGuest(guest)}
            />
          ))}
        </div>
      )}

      <BulkBar
        selectedGuestIds={[...selectedGuestIds]}
        households={households}
        tags={tags}
        functions={functions}
        onClear={clearSelection}
        onChanged={reload}
      />

      <HouseholdSheet
        open={householdSheetState !== null}
        onClose={() => setHouseholdSheetState(null)}
        household={openHousehold}
        eventId={eventId}
        tags={tags}
        functions={functions}
        onChanged={reload}
        onCreated={(id) => setHouseholdSheetState({ id })}
      />

      <GuestSheet
        open={guestSheetState !== null}
        onClose={() => setGuestSheetState(null)}
        guest={openGuest}
        householdId={guestSheetState?.householdId ?? ''}
        eventId={eventId}
        tags={tags}
        functions={functions}
        onChanged={reload}
      />

      <TagManager open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} eventId={eventId} tags={tags} onChanged={reload} />

      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} eventId={eventId} households={households} onChanged={reload} />
    </div>
  );
}

interface HouseholdCardProps {
  household: HouseholdWithGuests;
  tags: TagRow[];
  functions: FunctionRow[];
  selectedGuestIds: Set<string>;
  onToggleGuest: (id: string) => void;
  onToggleHousehold: (household: HouseholdWithGuests) => void;
  onEditHousehold: () => void;
  onAddGuest: () => void;
  onEditGuest: (guest: GuestWithDetails) => void;
  onDeleteGuest: (guest: GuestWithDetails) => void;
}

/** One household's row on the Guests list — `content-auto-cards` (globals.css) skips layout/paint
 *  for cards scrolled out of view, which is exactly the big-guest-list case that utility exists
 *  for (see CLAUDE.md). */
function HouseholdCard({
  household,
  tags,
  functions,
  selectedGuestIds,
  onToggleGuest,
  onToggleHousehold,
  onEditHousehold,
  onAddGuest,
  onEditGuest,
  onDeleteGuest,
}: HouseholdCardProps) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const allSelected = household.guests.length > 0 && household.guests.every((g) => selectedGuestIds.has(g.id));
  const someSelected = !allSelected && household.guests.some((g) => selectedGuestIds.has(g.id));

  return (
    <Card padding="none" className="content-auto-cards overflow-hidden">
      <div className="flex items-start gap-2 border-b border-separator-soft px-3 py-2.5">
        <input
          type="checkbox"
          aria-label={`Select every guest in ${household.name}`}
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => onToggleHousehold(household)}
          disabled={household.guests.length === 0}
          className="mt-1 h-4 w-4 shrink-0 rounded border-separator-control text-plum-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
        />
        <button
          type="button"
          onClick={onEditHousehold}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text-primary">{household.name}</span>
            {household.side_of_family && <Badge variant="muted">{SIDE_LABELS[household.side_of_family]}</Badge>}
            {household.category && <Badge variant="plum">{household.category}</Badge>}
          </div>
          {household.tagIds.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {household.tagIds
                .map((id) => tagById.get(id))
                .filter((t): t is TagRow => !!t)
                .map((tag) => (
                  <span key={tag.id} className="rounded-full bg-canvas px-2 py-0.5 text-2xs text-text-muted">
                    {tag.name}
                  </span>
                ))}
            </div>
          )}
        </button>
        <IconButton label={`Add guest to ${household.name}`} size="sm" onClick={onAddGuest}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
      </div>

      {household.guests.length === 0 ? (
        <p className="px-3 py-3 text-xs text-text-muted">No guests yet.</p>
      ) : (
        <ul className="divide-y divide-separator-soft">
          {household.guests.map((guest) => (
            <li key={guest.id} className="flex items-start gap-2 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`Select ${guestFullName(guest)}`}
                checked={selectedGuestIds.has(guest.id)}
                onChange={() => onToggleGuest(guest.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-separator-control text-plum-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
              />
              <button
                type="button"
                onClick={() => onEditGuest(guest)}
                className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm text-text-primary">{guestFullName(guest)}</span>
                  {guest.guest_type === 'child' && <Badge variant="muted">Child</Badge>}
                  {guest.is_vip && <Badge variant="gold">VIP</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {[guest.meal_preference, guest.dietary, guest.relationship].filter(Boolean).join(' · ') || 'No details yet'}
                </p>
                {(guest.tagIds.length > 0 || guest.functionInvites.some((i) => i.invited)) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {guest.tagIds
                      .map((id) => tagById.get(id))
                      .filter((t): t is TagRow => !!t)
                      .map((tag) => (
                        <span key={tag.id} className="rounded-full bg-canvas px-2 py-0.5 text-2xs text-text-muted">
                          {tag.name}
                        </span>
                      ))}
                    {functions.map((fn) => {
                      const invite = guest.functionInvites.find((i) => i.function_id === fn.id && i.invited);
                      if (!invite) return null;
                      return (
                        <span key={fn.id} className={cn('rounded-full px-2 py-0.5 text-2xs', RSVP_CHIP_STYLES[invite.rsvp])}>
                          {fn.name}: {RSVP_LABELS[invite.rsvp]}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
              <Menu
                label={`Actions for ${guestFullName(guest)}`}
                trigger={(props) => (
                  <IconButton {...props} label={`Actions for ${guestFullName(guest)}`} size="sm">
                    <MoreVertical size={16} aria-hidden="true" />
                  </IconButton>
                )}
                items={[
                  { key: 'edit', label: 'Edit', icon: <Pencil size={14} aria-hidden="true" />, onSelect: () => onEditGuest(guest) },
                  {
                    key: 'remove',
                    label: 'Remove',
                    icon: <Trash2 size={14} aria-hidden="true" />,
                    tone: 'danger',
                    onSelect: () => onDeleteGuest(guest),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
