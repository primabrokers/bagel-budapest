import { useMemo, useState } from 'react';
import { BookUser, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { confirmDialog } from '../hooks/useConfirm';
import { useGuestBook } from '../data/guests/hooks';
import { useVendors } from '../data/vendors/hooks';
import { useCustomContacts } from '../data/contacts/hooks';
import { deleteCustomContact } from '../data/contacts/mutations';
import { ContactActions } from '../components/contacts/ContactActions';
import { CustomContactSheet } from '../components/contacts/CustomContactSheet';
import type { CustomContactRow } from '../data/contacts/types';

type ContactKind = 'household' | 'vendor' | 'custom';

interface ContactEntry {
  id: string;
  kind: ContactKind;
  name: string;
  subtitle: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Only for `kind === 'custom'` — what the edit/delete actions operate on. */
  custom?: CustomContactRow;
}

const KIND_LABEL: Record<ContactKind, string> = {
  household: 'Household',
  vendor: 'Vendor',
  custom: 'Contact',
};

const KIND_BADGE: Record<ContactKind, 'plum' | 'gold' | 'muted'> = {
  household: 'plum',
  vendor: 'gold',
  custom: 'muted',
};

function matches(entry: ContactEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [entry.name, entry.subtitle, entry.phone, entry.email, entry.whatsapp].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

/**
 * One combined, searchable address book — households and vendors are read-only here (managed on
 * their own pages, `data/guests/` and `data/vendors/` respectively); custom contacts get full
 * add/edit/delete. `ContactActions` gives every row the same tel:/wa.me/mailto affordance
 * regardless of which of the three it came from.
 */
export function ContactsPage() {
  const { data: householdsData, loading: householdsLoading } = useGuestBook();
  const { data: vendorsData, loading: vendorsLoading } = useVendors();
  const { data: customData, loading: customLoading, reload: reloadCustom } = useCustomContacts();

  const [search, setSearch] = useState('');
  const [sheetState, setSheetState] = useState<{ contact: CustomContactRow | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loading = householdsLoading && vendorsLoading && customLoading;

  const entries = useMemo<ContactEntry[]>(() => {
    const households: ContactEntry[] = (householdsData ?? [])
      .filter((h) => h.main_contact_name || h.phone || h.email || h.whatsapp)
      .map((h) => ({
        id: `household-${h.id}`,
        kind: 'household',
        name: h.main_contact_name || h.name,
        subtitle: h.main_contact_name ? h.name : null,
        phone: h.phone,
        email: h.email,
        whatsapp: h.whatsapp,
      }));

    const vendors: ContactEntry[] = (vendorsData ?? [])
      .filter((v) => v.contact_name || v.phone || v.email || v.whatsapp)
      .map((v) => ({
        id: `vendor-${v.id}`,
        kind: 'vendor',
        name: v.contact_name || v.name,
        subtitle: v.contact_name ? v.name : v.category,
        phone: v.phone,
        email: v.email,
        whatsapp: v.whatsapp,
      }));

    const custom: ContactEntry[] = (customData ?? []).map((c) => ({
      id: `custom-${c.id}`,
      kind: 'custom',
      name: c.name,
      subtitle: c.role,
      phone: c.phone,
      email: c.email,
      whatsapp: c.whatsapp,
      custom: c,
    }));

    return [...households, ...vendors, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  }, [householdsData, vendorsData, customData]);

  const query = search.trim().toLowerCase();
  const filtered = entries.filter((e) => matches(e, query));

  async function handleDeleteCustom(contact: CustomContactRow) {
    const ok = await confirmDialog(`Remove "${contact.name}"?`, { tone: 'danger', confirmLabel: 'Remove' });
    if (!ok) return;
    setDeletingId(contact.id);
    try {
      await deleteCustomContact(contact.id);
      showToast('Contact removed', 'success');
      reloadCustom();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <PageHeader
        title="Contacts"
        subtitle="Every phone number and email for the day, in one place."
        actions={
          <Button type="button" onClick={() => setSheetState({ contact: null })}>
            <Plus size={15} aria-hidden="true" />
            Add contact
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          type="search"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          aria-label="Search contacts"
          className="pl-8"
        />
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title={entries.length > 0 ? 'No contacts match that search' : 'No contacts yet'}
          hint={entries.length > 0 ? 'Try a different search.' : 'Households and vendors with a phone or email show up here automatically — add anyone else, like the rabbi or a photographer\'s assistant, by hand.'}
          action={
            entries.length === 0 && (
              <Button type="button" size="sm" onClick={() => setSheetState({ contact: null })}>
                <Plus size={14} aria-hidden="true" />
                Add contact
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <Card padding="sm" className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-text-primary">{entry.name}</p>
                    <Badge variant={KIND_BADGE[entry.kind]}>{KIND_LABEL[entry.kind]}</Badge>
                  </div>
                  {entry.subtitle && <p className="truncate text-xs text-text-muted">{entry.subtitle}</p>}
                </div>
                <ContactActions phone={entry.phone} whatsapp={entry.whatsapp} email={entry.email} />
                {entry.custom && (
                  <div className="flex shrink-0 items-center gap-0.5 border-l border-separator-soft pl-1.5">
                    <IconButton label={`Edit ${entry.name}`} size="sm" onClick={() => setSheetState({ contact: entry.custom! })}>
                      <Pencil size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${entry.name}`}
                      size="sm"
                      disabled={deletingId !== null}
                      onClick={() => void handleDeleteCustom(entry.custom!)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CustomContactSheet
        open={sheetState !== null}
        onClose={() => setSheetState(null)}
        contact={sheetState?.contact ?? null}
        onSaved={reloadCustom}
      />
    </div>
  );
}
