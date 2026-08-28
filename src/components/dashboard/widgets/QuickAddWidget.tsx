import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';
import { Button } from '../../ui/Button';
import { QuickAddSheet } from '../../QuickAddSheet';

/** The dashboard's own entry point into the same chooser the FAB opens (`QuickAddSheet`) — a
 *  plain trigger button rather than a compact re-implementation of the chooser grid, since the
 *  widget's own card is already narrow at the phone width this app targets first. */
export function QuickAddWidget() {
  const [open, setOpen] = useState(false);

  return (
    <DashboardWidgetCard title="Quick add">
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full">
        <Plus size={16} aria-hidden="true" />
        Add something
      </Button>
      <QuickAddSheet open={open} onClose={() => setOpen(false)} />
    </DashboardWidgetCard>
  );
}
