import { useMemo, useState } from 'react';
import { Handshake, LayoutGrid, List, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { useVendors } from '../data/vendors/hooks';
import { toggleVendorFavourite } from '../data/vendors/mutations';
import { VendorCard } from '../components/vendors/VendorCard';
import { VendorSheet } from '../components/vendors/VendorSheet';
import { VendorContactSheet } from '../components/vendors/VendorContactSheet';
import { useEvent } from '../data/event/hooks';
import { useEventContext } from '../data/event/context';
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS } from '../components/vendors/statusMeta';
import { VENDOR_CATEGORIES } from '../lib/vendors/categories';
import type { VendorWithQuotes } from '../data/vendors/types';

type ViewMode = 'board' | 'list';

const VIEW_TABS: TabItem<ViewMode>[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid },
  { key: 'list', label: 'List', icon: List },
];

export function VendorsPage() {
  const { data: vendors, loading, reload } = useVendors();
  const [view, setView] = useState<ViewMode>('board');
  const [category, setCategory] = useState('all');
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [favouriteBusyId, setFavouriteBusyId] = useState<string | null>(null);
  const [contactVendorId, setContactVendorId] = useState<string | null>(null);
  const { eventId } = useEventContext();
  const { data: event } = useEvent();

  const filtered = useMemo(() => {
    const all = vendors ?? [];
    return category === 'all' ? all : all.filter((v) => v.category === category);
  }, [vendors, category]);

  const contactVendor = contactVendorId ? (vendors?.find((v) => v.id === contactVendorId) ?? null) : null;
  const openVendor = openVendorId ? (filtered.find((v) => v.id === openVendorId) ?? vendors?.find((v) => v.id === openVendorId) ?? null) : null;

  function openEdit(vendor: VendorWithQuotes) {
    setOpenVendorId(vendor.id);
    setSheetMode('edit');
  }

  function openAdd() {
    setOpenVendorId(null);
    setSheetMode('add');
  }

  function closeSheet() {
    setSheetMode('closed');
    setOpenVendorId(null);
  }

  async function handleToggleFavourite(vendor: VendorWithQuotes) {
    setFavouriteBusyId(vendor.id);
    try {
      await toggleVendorFavourite(vendor.id, !vendor.favourite);
      reload();
    } catch {
      showToast('Could not update favourite — please try again.', 'error');
    } finally {
      setFavouriteBusyId(null);
    }
  }

  const categoriesInUse = useMemo(() => {
    const used = new Set((vendors ?? []).map((v) => v.category));
    return VENDOR_CATEGORIES.filter((c) => used.has(c));
  }, [vendors]);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Vendors"
        subtitle="Every supplier for the day, from first enquiry to final invoice."
        actions={
          <Button type="button" onClick={openAdd}>
            <Plus size={15} aria-hidden="true" />
            Add vendor
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs items={VIEW_TABS} value={view} onChange={setView} ariaLabel="Vendor view" variant="segmented" />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sm:w-56"
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categoriesInUse.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {loading && !vendors ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={vendors && vendors.length > 0 ? 'No vendors in this category' : 'No vendors yet'}
          hint={vendors && vendors.length > 0 ? 'Try a different category, or clear the filter.' : 'Add the venue, caterer, photographer — whoever you speak to first.'}
          action={
            !(vendors && vendors.length > 0) && (
              <Button type="button" size="sm" onClick={openAdd}>
                <Plus size={14} aria-hidden="true" />
                Add vendor
              </Button>
            )
          }
        />
      ) : view === 'list' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              onOpen={() => openEdit(vendor)}
              onToggleFavourite={() => void handleToggleFavourite(vendor)}
              favouriteBusy={favouriteBusyId === vendor.id}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Board columns — real side-by-side kanban from `sm` up, its own contained
              horizontal scroll (never the page's). Below `sm` this falls back to the same
              status-grouped list every phone screen in this app already reads comfortably,
              rather than a cramped, thumb-unfriendly horizontal scroller. */}
          <div className="hidden gap-3 overflow-x-auto pb-2 sm:flex">
            {VENDOR_STATUSES.map((status) => {
              const columnVendors = filtered.filter((v) => v.status === status);
              return (
                <div key={status} className="flex w-64 shrink-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
                      {VENDOR_STATUS_LABELS[status]}
                    </h2>
                    <span className="text-2xs tabular-nums text-text-faint">{columnVendors.length}</span>
                  </div>
                  {columnVendors.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-separator px-3 py-4 text-center text-2xs text-text-faint">
                      None
                    </p>
                  ) : (
                    columnVendors.map((vendor) => (
                      <VendorCard
                        key={vendor.id}
                        vendor={vendor}
                        onOpen={() => openEdit(vendor)}
                        onToggleFavourite={() => void handleToggleFavourite(vendor)}
                        favouriteBusy={favouriteBusyId === vendor.id}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-5 sm:hidden">
            {VENDOR_STATUSES.map((status) => {
              const columnVendors = filtered.filter((v) => v.status === status);
              if (columnVendors.length === 0) return null;
              return (
                <div key={status} className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
                    {VENDOR_STATUS_LABELS[status]} · {columnVendors.length}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {columnVendors.map((vendor) => (
                      <VendorCard
                        key={vendor.id}
                        vendor={vendor}
                        onOpen={() => openEdit(vendor)}
                        onToggleFavourite={() => void handleToggleFavourite(vendor)}
                        favouriteBusy={favouriteBusyId === vendor.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <VendorSheet
        open={sheetMode !== 'closed'}
        onClose={closeSheet}
        vendor={sheetMode === 'edit' ? openVendor : null}
        onSaved={reload}
        onContact={(vendorId) => {
          closeSheet();
          setContactVendorId(vendorId);
        }}
      />

      {contactVendor && (
        <VendorContactSheet
          open
          onClose={() => setContactVendorId(null)}
          eventId={eventId}
          vendor={contactVendor}
          event={event ?? null}
          onContacted={reload}
        />
      )}
    </div>
  );
}
