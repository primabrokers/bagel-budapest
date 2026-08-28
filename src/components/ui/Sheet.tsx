import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './IconButton';
import { useDialog } from '../../hooks/useDialog';

/**
 * The one modal surface in this kit — every dialog, drawer and bottom sheet in the app is this
 * component, not a bespoke `fixed inset-0` div. That is what makes the phone-first "sheet from
 * the bottom" idiom (CLAUDE.md's UI table) and the header/body/footer slot structure below
 * consistent everywhere they appear, instead of re-invented per screen.
 */

/**
 * The three overlay rungs. Anything that needs to sit above another overlay picks the next rung
 * up rather than inventing a number.
 *
 * - `base` — the ordinary sheet: an edit form, a detail drawer.
 * - `raised` — a sheet opened from inside another sheet (e.g. a document picker over an edit
 *   form) — one rung above `base` so it visibly sits on top rather than being indistinguishable.
 * - `top` — decisions and announcements that must survive anything already open:
 *   `ConfirmHost`, `ToastHost`. Nothing in the app opens above this rung.
 */
export const LAYER = {
  base: 'z-50',
  raised: 'z-[60]',
  top: 'z-[200]',
} as const;

export type SheetLayer = keyof typeof LAYER;

type Size = 'sm' | 'md' | 'lg' | 'xl';

const centreSize: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const rightSize: Record<Size, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name. Required — a dialog with no name is announced as "dialog". */
  title: ReactNode;
  /** Optional glyph in a tinted chip beside the title. Decorative — rendered `aria-hidden`. */
  icon?: ReactNode;
  /** Tints the icon chip. Colour is never the only cue: the title says what this is. */
  tone?: 'default' | 'danger';
  /** Optional second line under the title, wired to aria-describedby. */
  description?: ReactNode;
  /**
   * `centre` is the modal; `right` is a slide-over; `drawer` is that same slide-over from `sm`
   * up and a bottom sheet below it.
   *
   * `drawer` exists because a right-anchored panel on a 390px screen is simply the whole screen
   * arriving from the side, with its close button in the corner furthest from the thumb. The
   * switch is pure CSS — no viewport hook — so one mount renders correctly at both widths.
   */
  anchor?: 'centre' | 'right' | 'drawer';
  size?: Size;
  layer?: SheetLayer;
  /** Sticky action row. Stays inside the viewport at 390px — see the dvh note below. */
  footer?: ReactNode;
  /** Extra classes for the panel, not the backdrop. */
  className?: string;
  /**
   * Extra classes for the scrolling body. Chiefly `p-0`, for a child that brings its own padding
   * and footer and would otherwise sit in a padded box inside a padded box.
   */
  bodyClassName?: string;
  children: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  icon,
  tone = 'default',
  description,
  anchor = 'centre',
  size = 'md',
  layer = 'base',
  footer,
  className,
  bodyClassName,
  children,
}: SheetProps) {
  const titleId = useId();
  const descId = useId();
  // `enabled: open` is load-bearing — see the comment on UseDialogOptions.enabled.
  const { panelRef, backdropProps } = useDialog(onClose, { enabled: open });

  if (!open) return null;

  return (
    <div
      {...backdropProps}
      data-sheet
      className={cn(
        'fixed inset-0 flex bg-black/40',
        LAYER[layer],
        anchor === 'centre'
          ? 'items-center justify-center p-4'
          : // A column below `sm` so the panel is pushed to the BOTTOM edge rather than the
            // right — the same backdrop, re-aimed, with no second element and no viewport hook.
            anchor === 'drawer'
            ? 'justify-end max-sm:flex-col max-sm:justify-end'
            : 'justify-end',
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-surface shadow-lg',
          // dvh, never vh: iOS Safari sizes vh to the viewport WITHOUT browser chrome, so a
          // footer positioned against the bottom of a 92vh panel sits below the fold on a phone
          // whose address bar hasn't collapsed yet — and this app is installed with zoom
          // locked, so there is no pinching that footer back into view.
          anchor === 'centre'
            ? cn('max-h-[92dvh] rounded-xl border border-separator', centreSize[size])
            : anchor === 'drawer'
              ? cn(
                  // Above `sm` this is byte-for-byte the right slide-over. Below it the panel
                  // takes the full width it already has, sits on the bottom edge, keeps 14dvh of
                  // the page behind it visible (reads as a sheet over a screen, not a new
                  // screen), and pads past the home indicator so the last action isn't under it.
                  'border-separator sm:h-dvh sm:border-l',
                  'max-sm:mt-auto max-sm:max-h-[86dvh] max-sm:rounded-t-2xl max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)]',
                  rightSize[size],
                )
              : cn('h-dvh border-l border-separator', rightSize[size]),
          className,
        )}
      >
        {/* The grab handle. Decoration — dragging is not implemented — but the affordance that
            says "this came up from the bottom and goes back down", read before the close button. */}
        {anchor === 'drawer' && (
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-separator-strong sm:hidden" />
        )}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-separator px-5 py-3.5">
          {/* min-w-0 so a long unbroken name truncates rather than forcing the panel wider than
              the phone screen. */}
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                  tone === 'danger' ? 'bg-danger-bg text-danger-text' : 'bg-plum-50 text-plum-700',
                )}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-sm font-semibold text-text-primary">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-xs text-text-muted">
                  {description}
                </p>
              )}
            </div>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1.5 shrink-0">
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>

        {/* min-h-0 so the body, not the panel, is what scrolls — without it a long body pushes
            the footer off the bottom of a flex column. */}
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>

        {footer && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-separator bg-canvas px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
