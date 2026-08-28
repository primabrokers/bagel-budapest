import { useEffect, useState } from 'react';

/**
 * Status notifications — "Guest added", "Could not save, try again" — as a module-level store so
 * `showToast()` is callable from a plain async function (a mutation's `.catch`, a saved-search
 * handler) and not only from inside a component. `ToastHost`, mounted once in the app shell,
 * renders whatever the store currently holds.
 *
 * This is the replacement `window.alert` is banned in favour of (see eslint.config.js) —
 * `alert()` blocks the main thread and paints unstyled browser chrome over an app installed to
 * the home screen. For a DECISION rather than a status, use `confirmDialog()` from
 * `hooks/useConfirm` instead.
 */

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

/** How long a toast stays up before it clears itself. An error stays up longer — it is more
 *  often the only record that something went wrong, and is worth the extra second to read. */
const DURATION_MS: Record<ToastTone, number> = {
  info: 3000,
  success: 3000,
  error: 5000,
};

/** Show a toast. Callable from anywhere — a component, a mutation function, an error handler. */
export function showToast(message: string, tone: ToastTone = 'info'): void {
  const toast: Toast = { id: nextId++, message, tone };
  toasts = [...toasts, toast];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    emit();
  }, DURATION_MS[tone]);
}

/** The live toast queue. Used by `ToastHost`; a component that only wants to SHOW a toast should
 *  call `showToast` directly rather than subscribing to the whole list. */
export function useToastList(): Toast[] {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setList);
    setList(toasts);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
