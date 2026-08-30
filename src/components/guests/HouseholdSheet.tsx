import { useEffect, useState } from 'react';
import { Copy, Link2, MessageCircle, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { cn } from '../../lib/cn';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import {
  createGuests,
  createHouseholdWithGuests,
  deleteHousehold,
  setHouseholdTags,
  updateHousehold,
} from '../../data/guests/mutations';
import { PeopleRows } from './PeopleRows';
import {
  derivedHouseholdName,
  initialPeople,
  toGuestInputs,
  type PersonDraft,
} from '../../lib/guests/personDraft';
import { useRsvpLinks } from '../../data/invitations/hooks';
import { buildWhatsAppLink } from '../../lib/share';
import { GuestSheet } from './GuestSheet';
import type { FunctionRow } from '../../data/event/types';
import type { GuestWithDetails, HouseholdWithGuests, SideOfFamily, TagRow } from '../../data/guests/types';

const SIDES: SideOfFamily[] = ['father', 'mother', 'both', 'friends', 'community', 'other'];
const SIDE_LABELS: Record<SideOfFamily, string> = {
  father: "Father's side",
  mother: "Mother's side",
  both: 'Both sides',
  friends: 'Friends',
  community: 'Community',
  other: 'Other',
};

interface HouseholdFormState {
  name: string;
  main_contact_name: string;
  side_of_family: SideOfFamily | '';
  category: string;
  address_lines: string;
  postcode: string;
  email: string;
  phone: string;
  whatsapp: string;
  notes: string;
}

const EMPTY_FORM: HouseholdFormState = {
  name: '',
  main_contact_name: '',
  side_of_family: '',
  category: '',
  address_lines: '',
  postcode: '',
  email: '',
  phone: '',
  whatsapp: '',
  notes: '',
};

function toForm(household: HouseholdWithGuests): HouseholdFormState {
  return {
    name: household.name,
    main_contact_name: household.main_contact_name ?? '',
    side_of_family: household.side_of_family ?? '',
    category: household.category ?? '',
    address_lines: household.address_lines ?? '',
    postcode: household.postcode ?? '',
    email: household.email ?? '',
    phone: household.phone ?? '',
    whatsapp: household.whatsapp ?? '',
    notes: household.notes ?? '',
  };
}

function guestFullName(guest: { first_name: string; last_name: string | null }): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

interface HouseholdSheetProps {
  open: boolean;
  onClose: () => void;
  /** `null` — the "Add household" flow. */
  household: HouseholdWithGuests | null;
  eventId: string;
  tags: TagRow[];
  functions: FunctionRow[];
  onChanged: () => void;
  /** Fired once a brand-new household is created, so the caller can start tracking its real id —
   *  the guest/tag sections below only appear once `household` itself reflects that id. */
  onCreated?: (id: string) => void;
}

/**
 * One household's own fields, its guests (add/edit/remove via a nested `GuestSheet`), its tags,
 * and its RSVP link — copy it directly, or share it over WhatsApp via `lib/share.ts`'s
 * `buildWhatsAppLink` (Stage 5). A brand-new household has no guests/tags/RSVP section until it
 * has been saved once and has a real id — the link itself is auto-created by a DB trigger the
 * moment the household row exists (migration 3's `bm_households_create_rsvp_link`), so once
 * `household` is non-null the link is already there; `useRsvpLinks()` just has to have loaded.
 */
export function HouseholdSheet({ open, onClose, household, eventId, tags, functions, onChanged, onCreated }: HouseholdSheetProps) {
  const [form, setForm] = useState<HouseholdFormState>(EMPTY_FORM);
  const [people, setPeople] = useState<PersonDraft[]>(initialPeople);
  const [saving, setSaving] = useState(false);
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [guestSheetOpen, setGuestSheetOpen] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  // Tracked by id, not by object reference: a tag/RSVP change made inside the nested GuestSheet
  // triggers onChanged() -> a parent reload -> a fresh `household.guests` array, and re-deriving
  // from that fresh array (instead of pinning the object captured when the sheet was opened) is
  // what keeps the nested sheet's own toggles working off current data rather than a stale copy.
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const editingGuest = editingGuestId ? (household?.guests.find((g) => g.id === editingGuestId) ?? null) : null;

  const { data: rsvpLinksData } = useRsvpLinks();
  const rsvpLink = household ? (rsvpLinksData ?? []).find((l) => l.household_id === household.id && !l.revoked) : undefined;
  const rsvpUrl = rsvpLink ? `${window.location.origin}/rsvp/${rsvpLink.token}` : null;
  const rsvpWhatsAppLink = rsvpUrl
    ? buildWhatsAppLink(household?.whatsapp || household?.phone, `Hi${household?.main_contact_name ? ` ${household.main_contact_name}` : ''}, please RSVP here: ${rsvpUrl}`)
    : null;

  useEffect(() => {
    if (!open) return;
    setForm(household ? toForm(household) : EMPTY_FORM);
    setPeople(initialPeople());
    // Deliberately keyed on the id, not the whole `household` object: a tag/guest change made
    // from inside this sheet triggers onChanged() -> a parent reload -> a new `household` object
    // reference every time, and resetting the form fields on every one of those would clobber
    // whatever the family is mid-typing in the name/address/notes fields above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, household?.id]);

  /** Fills the household's own blank contact fields from an imported contact. Only ever fills a
   *  blank — an import must never overwrite something the family typed. */
  function applyImportedDetails(details: { phone?: string; email?: string; address?: string }) {
    setForm((f) => ({
      ...f,
      phone: f.phone || details.phone || '',
      email: f.email || details.email || '',
      address_lines: f.address_lines || details.address || '',
    }));
  }

  async function handleSubmit() {
    // Falls back to the first surname on the card — "Cohen" — so a family whose name is already
    // sitting in the people rows below does not have to be typed twice.
    const name = form.name.trim() || derivedHouseholdName(people);
    if (!name) {
      showToast('Give the household a name, or add someone with a surname.', 'error');
      return;
    }
    setSaving(true);
    try {
      const patch = {
        name,
        main_contact_name: form.main_contact_name.trim() || null,
        side_of_family: form.side_of_family || null,
        category: form.category.trim() || null,
        address_lines: form.address_lines.trim() || null,
        postcode: form.postcode.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        notes: form.notes.trim() || null,
      };
      // Numbered on from whoever is already on the card, so appending does not reshuffle them.
      const newPeople = toGuestInputs(people, household ? household.guests.length : 0);

      if (household) {
        await updateHousehold(household.id, patch);
        if (newPeople.length > 0) {
          // Appended after whoever is already on the card, so adding three cousins does not
          // shuffle them in among the parents.
          await createGuests(eventId, household.id, newPeople, household.guests.length);
          setPeople(initialPeople());
        }
        showToast(
          newPeople.length > 0
            ? `Saved — ${newPeople.length} ${newPeople.length === 1 ? 'person' : 'people'} added`
            : 'Saved',
          'success',
        );
        onChanged();
      } else {
        // One action for the card AND everyone on it. This is the whole point of the block below:
        // a family of five used to be one save for the household plus five nested sheets, because
        // the guest section could not exist until the household had an id.
        const { household: created, guests } = await createHouseholdWithGuests(eventId, patch, newPeople);
        showToast(
          guests.length > 0
            ? `Added ${created.name} and ${guests.length} ${guests.length === 1 ? 'person' : 'people'}`
            : 'Household added',
          'success',
        );
        onChanged();
        onCreated?.(created.id);
      }
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleTag(tagId: string) {
    if (!household) return;
    const next = household.tagIds.includes(tagId)
      ? household.tagIds.filter((id) => id !== tagId)
      : [...household.tagIds, tagId];
    setTagBusy(tagId);
    try {
      await setHouseholdTags(household.id, next);
      onChanged();
    } catch {
      showToast('Could not update tags — please try again.', 'error');
    } finally {
      setTagBusy(null);
    }
  }

  async function handleDeleteHousehold() {
    if (!household) return;
    const guestCount = household.guests.length;
    const ok = await confirmDialog(`Remove "${household.name}"?`, {
      body:
        guestCount > 0
          ? `This removes all ${guestCount} guest${guestCount === 1 ? '' : 's'} in this household too. This cannot be undone.`
          : 'This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove household',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteHousehold(household.id);
      showToast('Household removed', 'success');
      onChanged();
      onClose();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyRsvpLink() {
    if (!rsvpUrl) return;
    setCopyingLink(true);
    try {
      await navigator.clipboard.writeText(rsvpUrl);
      showToast('Link copied', 'success');
    } catch {
      showToast('Could not copy the link — please try again.', 'error');
    } finally {
      setCopyingLink(false);
    }
  }

  function openAddGuest() {
    setEditingGuestId(null);
    setGuestSheetOpen(true);
  }

  function openEditGuest(guest: GuestWithDetails) {
    setEditingGuestId(guest.id);
    setGuestSheetOpen(true);
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={household ? household.name : 'Add household'}
        anchor="drawer"
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {household ? 'Close' : 'Cancel'}
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : household ? 'Save changes' : 'Create household'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Household name" htmlFor="household-name" required>
            <Input id="household-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>

          <Field label="Main contact" htmlFor="household-contact">
            <Input
              id="household-contact"
              value={form.main_contact_name}
              onChange={(e) => setForm((f) => ({ ...f, main_contact_name: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Side of family" htmlFor="household-side">
              <Select
                id="household-side"
                value={form.side_of_family}
                onChange={(e) => setForm((f) => ({ ...f, side_of_family: e.target.value as SideOfFamily | '' }))}
              >
                <option value="">Not set</option>
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {SIDE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="household-category" hint="e.g. Family, Friends, Work">
              <Input
                id="household-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor="household-email">
              <Input
                id="household-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Phone" htmlFor="household-phone">
              <Input id="household-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>

          <Field label="WhatsApp" htmlFor="household-whatsapp" hint="If different from phone">
            <Input
              id="household-whatsapp"
              value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            />
          </Field>

          <Field label="Address" htmlFor="household-address">
            <Textarea
              id="household-address"
              value={form.address_lines}
              onChange={(e) => setForm((f) => ({ ...f, address_lines: e.target.value }))}
            />
          </Field>

          <Field label="Postcode" htmlFor="household-postcode">
            <Input
              id="household-postcode"
              value={form.postcode}
              onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
            />
          </Field>

          <Field label="Notes" htmlFor="household-notes">
            <Textarea id="household-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>

          {household ? (
            <>
              <div className="border-t border-separator pt-3">
                <p className="mb-2 text-sm font-medium text-text-secondary">Tags</p>
                {tags.length === 0 ? (
                  <p className="text-xs text-text-muted">No tags yet — add one from &ldquo;Manage tags&rdquo;.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active = household.tagIds.includes(tag.id);
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

              <PeopleRows
                title="Add more people"
                people={people}
                onChange={setPeople}
                onContactDetails={applyImportedDetails}
              />

              <div className="border-t border-separator pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-secondary">Guests</p>
                  <Button type="button" size="sm" variant="secondary" onClick={openAddGuest}>
                    <Plus size={14} aria-hidden="true" />
                    Add one in full
                  </Button>
                </div>
                {household.guests.length === 0 ? (
                  <EmptyState compact icon={UserPlus} title="No guests in this household yet" />
                ) : (
                  <ul className="flex flex-col divide-y divide-separator-soft">
                    {household.guests.map((guest) => (
                      <li key={guest.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-text-primary">{guestFullName(guest)}</p>
                            {guest.guest_type === 'child' && <Badge variant="muted">Child</Badge>}
                            {guest.is_vip && <Badge variant="gold">VIP</Badge>}
                          </div>
                          {(guest.dietary || guest.meal_preference) && (
                            <p className="truncate text-xs text-text-muted">
                              {[guest.meal_preference, guest.dietary].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <IconButton label={`Edit ${guestFullName(guest)}`} size="sm" onClick={() => openEditGuest(guest)}>
                          <Pencil size={14} aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-separator pt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Link2 size={14} aria-hidden="true" />
                  RSVP link
                </p>
                {rsvpUrl ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Input readOnly value={rsvpUrl} className="font-mono text-xs" />
                      <IconButton label="Copy RSVP link" size="sm" disabled={copyingLink} onClick={() => void handleCopyRsvpLink()}>
                        <Copy size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                    {rsvpWhatsAppLink ? (
                      <a
                        href={rsvpWhatsAppLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-separator-control px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                      >
                        <MessageCircle size={13} aria-hidden="true" />
                        Share via WhatsApp
                      </a>
                    ) : (
                      <p className="text-xs text-text-muted">Add a phone number above to share this link via WhatsApp.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">RSVP link not available yet.</p>
                )}
              </div>

              <div className="border-t border-separator pt-3">
                <Button type="button" variant="danger" size="sm" onClick={() => void handleDeleteHousehold()} disabled={saving}>
                  <Trash2 size={14} aria-hidden="true" />
                  Remove household
                </Button>
              </div>
            </>
          ) : (
            <>
              <PeopleRows
                title="Who is in this household?"
                people={people}
                onChange={setPeople}
                onContactDetails={applyImportedDetails}
              />
              <p className="text-xs text-text-muted">
                Saving adds the household and everyone on it together. Tags and the RSVP link appear once it exists.
              </p>
            </>
          )}
        </div>
      </Sheet>

      {household && (
        <GuestSheet
          open={guestSheetOpen}
          onClose={() => setGuestSheetOpen(false)}
          guest={editingGuest}
          householdId={household.id}
          eventId={eventId}
          tags={tags}
          functions={functions}
          onChanged={onChanged}
          layer="raised"
        />
      )}
    </>
  );
}
