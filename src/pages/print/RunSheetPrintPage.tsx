import { useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { AUDIENCE_BADGE, AUDIENCE_LABELS } from '../../components/schedule/audienceMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatTime } from '../../lib/format';
import { useFunctions } from '../../data/event/hooks';
import { useScheduleItems } from '../../data/schedule/hooks';
import type { ScheduleItemRow } from '../../data/schedule/types';

interface ScheduleGroup {
  key: string;
  functionName: string;
  items: ScheduleItemRow[];
  earliest: string | null;
}

/**
 * `/print/run-sheet` — the full run sheet, time-ordered and grouped by function, mirroring
 * `RunSheetPage`'s own grouping minus its on-screen audience filter (a print copy always shows
 * everything). No `:id` param — there is only one run sheet per event.
 */
export function RunSheetPrintPage() {
  const { data: itemsData, loading: itemsLoading } = useScheduleItems();
  const { data: functionsData, loading: functionsLoading } = useFunctions();

  const loading = itemsLoading || functionsLoading;
  const items = useMemo(() => itemsData ?? [], [itemsData]);
  const functions = useMemo(() => functionsData ?? [], [functionsData]);

  const groups = useMemo<ScheduleGroup[]>(() => {
    const byFunction = new Map<string, ScheduleItemRow[]>();
    for (const item of items) {
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
    // sorts to the end.
    entries.sort((a, b) => {
      if (a.earliest && b.earliest) return a.earliest.localeCompare(b.earliest);
      if (a.earliest) return -1;
      if (b.earliest) return 1;
      return a.functionName.localeCompare(b.functionName);
    });
    return entries;
  }, [items, functions]);

  if (loading) {
    return (
      <PrintPageLayout title="Run sheet" pageSize="a4-document">
        <Skeleton className="h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  return (
    <PrintPageLayout title="Run sheet" pageSize="a4-document">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Run sheet</h1>
      </header>

      {groups.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing on the run sheet yet" />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.key} className="print-avoid-break">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.04em] text-text-muted">{group.functionName}</h2>
              <ul className="flex flex-col divide-y divide-separator-soft border-y border-separator">
                {group.items.map((item) => {
                  const subline = [item.location, item.responsible].filter(Boolean).join(' · ');
                  return (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                      <div className="w-16 shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-text-primary">
                          {item.starts_at ? formatTime(item.starts_at) : '—'}
                        </p>
                        {item.duration_minutes != null && (
                          <p className="text-2xs tabular-nums text-text-faint">{item.duration_minutes}m</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary">{item.activity}</p>
                        {subline && <p className="text-xs text-text-muted">{subline}</p>}
                        {item.audience !== 'all' && (
                          <div className="mt-1">
                            <Badge variant={AUDIENCE_BADGE[item.audience]}>{AUDIENCE_LABELS[item.audience]}</Badge>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PrintPageLayout>
  );
}
