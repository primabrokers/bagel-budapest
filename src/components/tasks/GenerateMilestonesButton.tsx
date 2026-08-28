import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { useEvent } from '../../data/event/hooks';
import { generateMilestoneTasks } from '../../data/tasks/mutations';
import { toLocalDateOnly } from '../../lib/format';

interface GenerateMilestonesButtonProps {
  /** Called after a successful run (even one that created nothing) so the caller can reload its
   *  task list. */
  onGenerated: () => void;
}

/**
 * Turns the standard milestone list (`lib/tasks/milestones.ts`) into real `bm_tasks` rows for
 * this event, via `generateMilestoneTasks` — idempotent, so pressing it again after some
 * milestones have already been generated only creates the ones still missing.
 */
export function GenerateMilestonesButton({ onGenerated }: GenerateMilestonesButtonProps) {
  const { eventId } = useEventContext();
  const { data: event } = useEvent();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!event) {
      showToast('Event details are still loading — try again in a moment.', 'error');
      return;
    }
    const eventDate = toLocalDateOnly(event.event_date);
    if (!eventDate) {
      showToast('The event date is not set yet — add it in Settings first.', 'error');
      return;
    }

    setBusy(true);
    try {
      const { created, skipped } = await generateMilestoneTasks(eventId, eventDate);
      if (created === 0) {
        showToast('All standard milestones already exist as tasks.', 'info');
      } else {
        showToast(
          `Added ${created} milestone task${created === 1 ? '' : 's'}` +
            (skipped > 0 ? ` (${skipped} already existed).` : '.'),
          'success',
        );
      }
      onGenerated();
    } catch {
      showToast('Could not generate milestone tasks — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={() => void handleClick()} disabled={busy}>
      <Sparkles size={15} aria-hidden="true" />
      {busy ? 'Generating…' : 'Generate milestone tasks'}
    </Button>
  );
}
