import { useMemo, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { activateOnKey } from '../lib/activate';
import { formatTime } from '../lib/format';
import { useFunctions } from '../data/event/hooks';
import { useVendors } from '../data/vendors/hooks';
import { useScheduleItems } from '../data/schedule/hooks';
import { ScheduleItemSheet } from '../components/schedule/ScheduleItemSheet';
import { AUDIENCES, AUDIENCE_BADGE, AUDIENCE_LABELS } from '../components/schedule/audienceMeta';
import type { ScheduleAudience, ScheduleItemRow } from '../data/schedule/types';

const AUDIENCE_TABS: TabItem<ScheduleAudience>[] = AUDIENCES.map((a) => ({ key: a, label: AUDIENCE_LABELS[a] }));

interface ScheduleGroup {
  key: string;
  functionName: string;
  items: ScheduleItemRow[];
  earliest: string | null;
}

export function RunSheetPage() {
  const { data: itemsData, loading, reload } = useScheduleItems();
  const { data: functionsData } = useFunctions();
  const { data: vendorsData } = useVendors();

  const items = useMemo(() => itemsData ?? [], [itemsData]);
  // Memoized like `items` above: a fresh `?? []` literal on every render (while still loading)
  // would make the `groups` useMemo below recompute every render regardless of whether the
  // functions actually changed.
  const functions = useMemo(() => functionsData ?? [], [functionsData]);
  const vendorNameById = useMemo(() => {
    const map = new Map<string, string>();
    (vendorsData ?? []).forEach((v) => map.set(v.id, v.name));
    return map;
  }, [vendorsData]);

  const [audienceFilter, setAudienceFilter] = useState<ScheduleAudience>('all');
  const [sheetState, setSheetState] = useState<{ item: ScheduleItemRow | null } | null>(null);

  const filtered = audienceFilter === 'all' ? items : items.filter((i) => i.audience === audienceFilter || i.audience === 'all');

  const groups = useMemo<ScheduleGroup[]>(() => {
    const byFunction = new Map<string, ScheduleItemRow[]>();
    for (const item of filtered) {
      const key = item.function_id ?? '__general__';
      const bucket = byFunction.get(key);
      if (bucket) bucket.push(item);
      else byFunction.set(key, [item]);
    }

    const entries: ScheduleGroup[] = Array.from(byFunction.entries()).map(([key, groupItems]) => {
      const fn = key === '__general__' ? null : functions.find((f) => f.id === key);
      const earliest = groupItems.reduce<string | null>((acc, it) => {
        if (!it.starts_at) return acc;
        if (!acc || it.starts_at < acc) return it.starts_at;
        return acc;
      }, null);
      return { key, functionName: fn?.name ?? 'General', items: groupItems, earliest };
    });

    // Time-ordered overall: groups with an earliest timed item sort by it; an all-untimed group
    // (e.g. items not yet scheduled) sorts to the end.
    entries.sort((a, b) => {
      if (a.earliest && b.earliest) return a.earliest.localeCompare(b.earliest);
      if (a.earliest) return -1;
      if (b.earliest) return 1;
      return a.functionName.localeCompare(b.functionName);
    });
    return entries;
  }, [filtered, functions]);

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Run sheet"
        subtitle="What happens when, for who, and who's running it."
        actions={
          <Button type="button" onClick={() => setSheetState({ item: null })}>
            <Plus size={15} aria-hidden="true" />
            Add item
          </Button>
        }
      />

      <Tabs
        items={AUDIENCE_TABS}
        value={audienceFilter}
        onChange={setAudienceFilter}
        ariaLabel="Filter the run sheet by audience"
        variant="segmented"
        className="mb-4"
      />

      {loading && !itemsData ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={items.length > 0 ? 'Nothing for this audience' : 'Nothing on the run sheet yet'}
          hint={items.length > 0 ? 'Try a different audience, or "Everyone".' : 'Add the moments of the day, from candle-lighting to the last dance.'}
          action={
            items.length === 0 && (
              <Button type="button" size="sm" onClick={() => setSheetState({ item: null })}>
                <Plus size={14} aria-hidden="true" />
                Add item
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.04em] text-text-muted">{group.functionName}</h2>
              <Card padding="none" className="divide-y divide-separator-soft overflow-hidden">
                {group.items.map((item) => {
                  const subline = [item.location, item.responsible, item.vendor_id ? vendorNameById.get(item.vendor_id) : null]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSheetState({ item })}
                      onKeyDown={activateOnKey(() => setSheetState({ item }))}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-hover',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plum-400',
                      )}
                    >
                      <div className="w-16 shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-text-primary">
                          {item.starts_at ? formatTime(item.starts_at) : '—'}
                        </p>
                        {item.duration_minutes != null && (
                          <p className="text-2xs tabular-nums text-text-faint">{item.duration_minutes}m</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{item.activity}</p>
                        {subline && <p className="truncate text-xs text-text-muted">{subline}</p>}
                        {item.audience !== 'all' && (
                          <div className="mt-1">
                            <Badge variant={AUDIENCE_BADGE[item.audience]}>{AUDIENCE_LABELS[item.audience]}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}

      <ScheduleItemSheet
        open={sheetState !== null}
        onClose={() => setSheetState(null)}
        item={sheetState?.item ?? null}
        onSaved={reload}
      />
    </div>
  );
}
