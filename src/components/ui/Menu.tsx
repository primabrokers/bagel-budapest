import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { nextRovingIndex, typeaheadIndex } from './rovingFocus';
import { LAYER } from './Sheet';

/**
 * The overflow / action menu — a button trigger and a positioned panel of `role="menuitem"`s,
 * closing on outside press and Escape, with arrow-key roving focus and type-ahead.
 *
 * Not for a combobox: a combobox's anchor is a text input whose list filters as you type, and
 * ARIA wants `role="combobox"`/`listbox` with `aria-activedescendant` there, not `menu`/
 * `menuitem` — Escape in a combobox clears the query before it closes the list, which is a
 * different contract from this component's Escape-always-closes.
 */

export interface MenuItemSpec {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  /** Draws a rule above this item. */
  separatorBefore?: boolean;
}

interface MenuProps {
  /**
   * The trigger. Receives the props it must carry — `aria-haspopup`, `aria-expanded`, the ref
   * and the toggle handler — so a caller cannot forget one of them.
   */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    onClick: () => void;
  }) => ReactNode;
  items: MenuItemSpec[];
  /** Which edge the panel hangs from. */
  align?: 'left' | 'right';
  /**
   * Which way the panel opens. Defaults to `bottom` (below the trigger).
   *
   * `top` exists for a trigger pinned to the BOTTOM of its container — the seating canvas's
   * "Add" button, for one. Opening downward from there puts the panel past the container's edge,
   * where an `overflow-hidden` ancestor clips it and the menu simply appears not to work.
   */
  side?: 'bottom' | 'top';
  /** Accessible name for the menu itself, e.g. "Guest actions". */
  label: string;
  className?: string;
}

export function Menu({ trigger, items, align = 'right', side = 'bottom', label, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Outside press and Escape. `pointerdown`, not `click`: a press that begins inside the menu
  // and ends outside it (a drag) should not dismiss it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Entering the menu puts focus on its first item, which is what makes the arrow keys
  // meaningful from the first press rather than the second.
  useEffect(() => {
    if (!open) return;
    setActive(0);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) itemRefs.current[active]?.focus();
  }, [open, active]);

  function choose(item: MenuItemSpec) {
    if (item.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    item.onSelect();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const next = nextRovingIndex(active, items.length, e.key, 'vertical');
    if (next != null) {
      e.preventDefault();
      setActive(next);
      return;
    }
    if (e.key === 'Tab') {
      // Tabbing out of an open menu closes it — leaving it open behind whatever is focused
      // next is how two menus end up open on screen at once.
      setOpen(false);
      return;
    }
    if (e.key.length === 1) {
      const hit = typeaheadIndex(items.map((i) => i.label), active, e.key);
      if (hit != null) {
        e.preventDefault();
        setActive(hit);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: () => setOpen((o) => !o),
      })}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          // -1, not 0: a roving tabindex puts the single tab stop on an ITEM, so the container
          // must be programmatically focusable without being a stop of its own.
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            // Above the base Sheet rung — a menu is frequently opened from a trigger that
            // itself lives inside a sheet. See LAYER in ui/Sheet.tsx.
            'absolute min-w-[200px] overflow-hidden rounded-lg border border-separator bg-surface py-1 shadow-lg',
            LAYER.raised,
            side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <div key={item.key}>
              {item.separatorBefore && <div role="separator" className="my-1 border-t border-separator-soft" />}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                // Roving tabindex: the menu is one tab stop, the arrows move within it.
                tabIndex={i === active ? 0 : -1}
                disabled={item.disabled}
                onClick={() => choose(item)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none',
                  'focus-visible:bg-hover',
                  item.disabled && 'cursor-not-allowed opacity-50',
                  !item.disabled &&
                    (item.tone === 'danger'
                      ? 'text-danger-text hover:bg-danger-bg'
                      : 'text-text-primary hover:bg-hover'),
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
