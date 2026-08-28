import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { nextRovingIndex, resolveStopIndex } from './rovingFocus';

/*
  ARIA-correct tabs: `role="tablist"` / `role="tab"` / `aria-selected`, and roving tabindex — only
  the selected tab is in the page's natural tab order, and the arrow keys move focus AND
  selection between tabs (the "automatic activation" model, appropriate here because every panel
  either already exists in memory or renders from cached data — nothing is fetched by arrowing
  past a tab, so there is no reason to make anyone press Enter as well).

  Deliberately no `aria-controls` / `role="tabpanel"`: on a phone-first screen the panels are
  conditionally rendered siblings, so only the selected one exists in the DOM at all, and
  `aria-controls` on every OTHER tab would point at an id that does not exist — worse than
  omitting it. Wire it up if a future screen keeps every panel mounted and merely hides the rest.
*/

export type TabBadgeTone = 'muted' | 'plum' | 'gold' | 'warning' | 'danger';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Leading icon. Rendered `aria-hidden` — the label is the accessible name. */
  icon?: LucideIcon;
  /**
   * Inline record count, rendered as "· 12". Pass `null` (or omit) to show nothing; a caller that
   * wants to hide a zero passes `n > 0 ? n : null`.
   */
  count?: number | null;
  /** Trailing pill for a "needs attention" number — RSVPs overdue, payments due. */
  badge?: ReactNode;
  badgeTone?: TabBadgeTone;
}

type Variant = 'underline' | 'segmented' | 'pill';
type Size = 'xs' | 'sm';

interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Names the strip for screen readers, e.g. "Guest record sections". Required. */
  ariaLabel: string;
  variant?: Variant;
  size?: Size;
  /**
   * `scroll` (default) is the phone rule: a track of `shrink-0` tabs inside an `overflow-x-auto`
   * rail. `wrap` lets a short strip fall onto a second line instead.
   */
  layout?: 'scroll' | 'wrap';
  /** Underline variant only: draw the hairline the active tab's underline sits on. */
  bordered?: boolean;
  /** Segmented variant only: share the width out evenly once there is room for it. */
  equalWidth?: boolean;
  className?: string;
}

const containerStyles: Record<Variant, string> = {
  underline: 'flex items-center border-separator',
  segmented: 'flex gap-1 rounded-lg bg-canvas p-1',
  pill: 'flex items-center gap-1',
};

const tabStyles: Record<Variant, { base: string; active: string; idle: string }> = {
  underline: {
    // shrink-0 is what makes the rail's overflow-x-auto actually scroll: without it the flex
    // items compress instead, and every tab crushes. The pixel floor (not h-11) is load-bearing
    // for the same reason IconButton spells its phone rung in pixels — see that component.
    base: '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 max-sm:min-h-[44px] transition-colors',
    active: 'border-plum-700 font-semibold text-plum-800',
    idle: 'border-transparent font-medium text-text-muted hover:text-text-primary',
  },
  segmented: {
    base: 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 max-sm:min-h-[44px] font-medium transition-colors',
    active: 'bg-surface text-text-primary shadow-sm',
    idle: 'text-text-muted hover:text-text-primary',
  },
  pill: {
    base: 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 max-sm:min-h-[44px] font-medium transition-colors',
    active: 'bg-plum-50 text-plum-800',
    idle: 'text-text-muted hover:bg-hover hover:text-text-primary',
  },
};

const badgeToneStyles: Record<TabBadgeTone, string> = {
  muted: 'bg-canvas text-text-muted',
  plum: 'bg-plum-100 text-plum-800',
  gold: 'bg-gold-100 text-gold-800',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
};

const sizeStyles: Record<Size, string> = { xs: 'text-xs', sm: 'text-sm' };
const iconSizes: Record<Size, number> = { xs: 12, sm: 14 };

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = 'underline',
  size = 'sm',
  layout = 'scroll',
  bordered = true,
  equalWidth = false,
  className,
}: TabsProps<K>) {
  const listRef = useRef<HTMLDivElement>(null);

  // On a phone the strip is often wider than the screen, so the selected tab can be off-screen
  // with nothing to hint it exists. Scroll the rail itself (never `scrollIntoView`, which would
  // also scroll the page and any ancestor scroller behind it).
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const active = list.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!active) return;
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    list.scrollLeft += activeBox.left - listBox.left - (list.clientWidth - activeBox.width) / 2;
  }, [value]);

  const styles = tabStyles[variant];
  const selectedIndex = items.findIndex((t) => t.key === value);
  const stopIndex = resolveStopIndex(selectedIndex, items.length);

  // On the tabs, not the tablist: the tablist is not itself a focus stop, so a handler there
  // would only ever fire by bubbling, and would make the container claim to be interactive.
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextRovingIndex(selectedIndex, items.length, event.key, 'horizontal');
    if (next == null) return;
    // Arrow keys own the strip: left/right would otherwise scroll the rail under the tabs, and
    // Home/End would jump the page.
    event.preventDefault();
    if (next === selectedIndex) return;
    onChange(items[next].key);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        containerStyles[variant],
        layout === 'wrap' ? 'flex-wrap' : 'overflow-x-auto',
        variant === 'underline' && bordered && 'border-b',
        sizeStyles[size],
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.key === value;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            // Roving tabindex: one stop for the whole strip, arrows move within it.
            tabIndex={index === stopIndex ? 0 : -1}
            data-tab-active={active}
            onClick={() => onChange(item.key)}
            onKeyDown={handleKeyDown}
            className={cn(
              styles.base,
              active ? styles.active : styles.idle,
              equalWidth && variant === 'segmented' && 'lg:flex-1 lg:shrink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
            )}
          >
            {Icon && <Icon size={iconSizes[size]} aria-hidden="true" />}
            {item.label}
            {item.count != null && (
              <span className={cn('text-xs font-medium tabular-nums', active ? 'text-plum-600' : 'text-text-faint')}>
                · {item.count}
              </span>
            )}
            {item.badge != null && (
              <span
                className={cn(
                  'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold tabular-nums',
                  badgeToneStyles[item.badgeTone ?? 'muted'],
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
