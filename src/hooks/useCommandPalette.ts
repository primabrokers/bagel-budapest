import { useEffect, useState } from 'react';

/**
 * Whether the ⌘K / Ctrl+K command palette is open, as a module-level store — the same shape as
 * `useToast`/`useConfirm`'s stores (see those files' own header comments). That is what lets a
 * search trigger ANYWHERE (a button in `TopBar`, another in `Sidebar`, the global keydown listener
 * `CommandPalette` itself installs) open it without threading open-state through `AppShell` —
 * `CommandPalette` is mounted once near the top of the authenticated tree and is the only thing
 * that reads this.
 */
let open = false;
const listeners = new Set<(open: boolean) => void>();

function emit() {
  listeners.forEach((l) => l(open));
}

export function openCommandPalette(): void {
  open = true;
  emit();
}

export function closeCommandPalette(): void {
  open = false;
  emit();
}

export function toggleCommandPalette(): void {
  open = !open;
  emit();
}

/** Subscribes to the open/closed state. Used by `CommandPalette` itself; a trigger button that
 *  only wants to OPEN the palette should call `openCommandPalette()` directly rather than
 *  subscribing to state it does not need. */
export function useCommandPaletteOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    listeners.add(setValue);
    setValue(open);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
