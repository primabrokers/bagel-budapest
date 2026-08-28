import { useToastList, type ToastTone } from '../../hooks/useToast';
import { cn } from '../../lib/cn';
import { LAYER } from './Sheet';

/** Renders whatever `showToast()` currently has queued. Mounted once, in the app shell,
 *  alongside `ConfirmHost`. */
export function ToastHost() {
  const toasts = useToastList();

  // Two live regions, not one. A toast is often the only confirmation that a background save
  // landed, and a single region would have to pick one politeness setting for both outcomes:
  // 'polite' lets a failure sit unread behind whatever is already being spoken, 'assertive'
  // interrupts for every routine success. Splitting them means errors interrupt and successes
  // wait their turn. Both stay mounted while empty — a live region inserted at the same moment
  // as its content is frequently not announced at all.
  const statuses = toasts.filter((t) => t.tone !== 'error');
  const alerts = toasts.filter((t) => t.tone === 'error');

  return (
    <div className={cn('pointer-events-none fixed bottom-4 right-4 flex flex-col gap-2 sm:bottom-6 sm:right-6', LAYER.top)}>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {statuses.map((t) => (
          <ToastBubble key={t.id} tone={t.tone} message={t.message} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
        {alerts.map((t) => (
          <ToastBubble key={t.id} tone={t.tone} message={t.message} />
        ))}
      </div>
    </div>
  );
}

const toneStyles: Record<ToastTone, string> = {
  success: 'border-success-fg bg-success-bg text-success-text',
  error: 'border-danger-fg bg-danger-bg text-danger-text',
  info: 'border-separator bg-surface text-text-primary',
};

function ToastBubble({ tone, message }: { tone: ToastTone; message: string }) {
  return (
    <div className={cn('pointer-events-auto max-w-[calc(100vw-2rem)] rounded-lg border px-4 py-2.5 text-sm shadow-lg', toneStyles[tone])}>
      {message}
    </div>
  );
}
