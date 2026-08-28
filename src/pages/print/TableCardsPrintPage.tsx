import { useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { compareTableOrder } from '../../components/print/tableOrder';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSeatingPlan } from '../../data/seating/hooks';
import { floorObjectLabel, isSeatableKind } from '../../lib/seating/tableGeometry';

/**
 * `/print/table-cards/:planId` — one card per TABLE (not per guest): its label/number, large and
 * centred, meant to be folded and stood on the table itself. Same grid-of-cards page mode as
 * `PlaceCardsPrintPage`, but larger/bolder type — this one needs to be readable from a few feet
 * away, not held in the hand.
 */
export function TableCardsPrintPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, loading } = useSeatingPlan(planId ?? null);

  if (loading) {
    return (
      <PrintPageLayout title="Table cards" pageSize="a4-card-grid">
        <Skeleton className="col-span-2 h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!plan) {
    return (
      <PrintPageLayout title="Table cards" pageSize="a4-card-grid">
        <div className="col-span-2">
          <EmptyState icon={Frown} title="Seating plan not found" hint="This plan may have been removed." />
        </div>
      </PrintPageLayout>
    );
  }

  const tables = plan.objects.filter((obj) => isSeatableKind(obj.kind)).slice().sort(compareTableOrder);

  return (
    <PrintPageLayout title={`Table cards — ${plan.name}`} pageSize="a4-card-grid">
      {tables.length === 0 ? (
        <div className="col-span-2">
          <EmptyState icon={Frown} title="No tables on this plan yet" hint="Add some tables to the floor plan first." />
        </div>
      ) : (
        tables.map((table) => {
          // A table carrying BOTH a custom name and a number gets both lines — some guests will
          // look for "Table 5", others for whatever the family called it — rather than picking
          // one and losing the other the way floorObjectLabel's own single-string fallback does.
          const showNumberLine = table.label != null && table.table_number != null;
          return (
            <div key={table.id} className="print-card-grid-cell">
              <p className="font-display text-4xl font-bold leading-tight text-text-primary">{floorObjectLabel(table)}</p>
              {showNumberLine && <p className="text-lg text-text-muted">Table {table.table_number}</p>}
            </div>
          );
        })
      )}
    </PrintPageLayout>
  );
}
