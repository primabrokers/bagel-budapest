import { useEffect, useState, type DragEventHandler } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Money } from '../ui/Money';
import { Menu } from '../ui/Menu';
import { cn } from '../../lib/cn';
import { activateOnKey } from '../../lib/activate';
import { getSignedIdeaImageUrl } from '../../data/ideas/mutations';
import type { IdeaRow, IdeaStatus } from '../../data/ideas/types';
import { IDEA_STATUSES, IDEA_STATUS_BADGE, IDEA_STATUS_LABELS } from './statusMeta';

interface IdeaCardProps {
  idea: IdeaRow;
  onOpen: () => void;
  onChangeStatus: (status: IdeaStatus) => void;
  statusBusy?: boolean;
  /** Shown as a muted line under the title — only needed where the surrounding layout doesn't
   *  already say which board this is (`IdeasPage`'s phone grid, which flattens every board into
   *  one list); the desktop board columns leave it unset since the column header already says it. */
  boardName?: string | null;
  /** Desktop drag-to-change-status — see `IdeasPage`'s status drop rail. Progressive enhancement
   *  only; the status `Menu` below always works standalone, on every breakpoint. */
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  className?: string;
}

/** One idea's card, used both in `IdeasPage`'s board columns and its phone grid. The whole card
 *  opens `IdeaSheet`; the status `Menu` is its own nested button, stopping propagation so
 *  choosing a status doesn't also open the sheet — the same pattern `VendorCard`'s favourite
 *  star uses. */
export function IdeaCard({ idea, onOpen, onChangeStatus, statusBusy, boardName, draggable, onDragStart, className }: IdeaCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!idea.image_path) {
      setImageUrl(null);
      return;
    }
    getSignedIdeaImageUrl(idea.image_path)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [idea.image_path]);

  return (
    // A plain div, not a `Card` prop, carries `draggable`/`onDragStart` — `Card` only accepts
    // its own fixed prop set (see components/ui/Card.tsx) and doesn't forward arbitrary DOM
    // attributes, so the drag wiring has to sit one level up, around it. It is a native HTML5
    // drag SOURCE only, which has no keyboard equivalent to add — dragging is pointer-only by
    // definition. The accessible, keyboard- and screen-reader-reachable way to do the same thing
    // is the status `Menu` nested inside this card, which works identically either way.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div draggable={draggable} onDragStart={onDragStart} className={cn(draggable && 'cursor-grab active:cursor-grabbing', className)}>
      <Card padding="sm" shadow="none" className="flex flex-col gap-2 transition-colors hover:border-plum-300">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={activateOnKey(onOpen)}
          className="flex cursor-pointer flex-col gap-2 focus-visible:outline-none"
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              width={320}
              height={180}
              loading="lazy"
              decoding="async"
              className="aspect-video w-full rounded-md object-cover"
            />
          )}

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{idea.title}</p>
              {boardName && <p className="truncate text-xs text-text-muted">{boardName}</p>}
            </div>
            <Menu
              label={`Move "${idea.title}" to a different status`}
              align="right"
              trigger={(props) => (
                <button
                  ref={props.ref}
                  type="button"
                  aria-haspopup={props['aria-haspopup']}
                  aria-expanded={props['aria-expanded']}
                  disabled={statusBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClick();
                  }}
                  className="-mr-1 -mt-1 inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-2xs font-medium text-text-muted transition-colors hover:bg-canvas hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                >
                  Move
                  <ChevronDown size={11} aria-hidden="true" />
                </button>
              )}
              items={IDEA_STATUSES.filter((s) => s !== idea.status).map((s) => ({
                key: s,
                label: IDEA_STATUS_LABELS[s],
                onSelect: () => onChangeStatus(s),
              }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={IDEA_STATUS_BADGE[idea.status]}>{IDEA_STATUS_LABELS[idea.status]}</Badge>
            {idea.cost_estimate != null && <Money value={idea.cost_estimate} className="text-xs font-medium text-text-secondary" />}
          </div>

          {idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {idea.tags.map((tag) => (
                <Badge key={tag} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
