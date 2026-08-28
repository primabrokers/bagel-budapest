import { useEffect, useState } from 'react';

/**
 * Promise-based replacements for `window.confirm` (`confirmDialog`) and `window.prompt`
 * (`promptDialog`). One store, one host, one queue — a prompt is a confirm that also carries an
 * answer, and two overlapping dialog queues would each be unaware of the other's open panel.
 *
 * The native dialogs are banned (see eslint.config.js) for the same three reasons everywhere in
 * this app: they are unstyled browser chrome breaking through a PWA installed to the home
 * screen, `window.confirm`/`alert` can show only one line of plain text, and all three block the
 * main thread while they're up.
 *
 * Deliberately keeps the call shape of the thing it replaces, so the guard reads the same:
 *
 *   if (!(await confirmDialog('Remove this guest?'))) return;
 *   if (!(await confirmDialog('Cancel this vendor booking?', { body: 'Any deposit stays on the invoice.', tone: 'danger', confirmLabel: 'Cancel booking' }))) return;
 *
 * Same module-level store pattern as `useToast` — callable from a plain mutation function, not
 * only from a component.
 */

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  /** Optional supporting detail under the message — consequences, what is left untouched. */
  body?: string;
  /** Label of the confirming action. Say what it does: "Remove", not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

/** The single text field a `promptDialog` puts above its buttons. */
export interface PromptInput {
  /** Names the answer, not the question — "Reason", "New table name". */
  label: string;
  placeholder?: string;
  /** Prefilled value; the field opens with it selected so typing replaces it. */
  defaultValue?: string;
  /** Hold the confirming button disabled until something non-blank is typed. */
  required?: boolean;
  /** Shown against the field once it has been touched and left blank. */
  requiredMessage?: string;
  /** A reason is a sentence rather than a word — those want a textarea. */
  multiline?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  /** Defaults to a single field labelled "Answer" when omitted — pass a real label whenever the
   *  field means something more specific than that. */
  input?: PromptInput;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone: ConfirmTone;
  /** Present iff this request came from `promptDialog`; drives the host's shape and result. */
  input?: PromptInput;
  /** `boolean` for a confirm, `string | null` for a prompt. The host knows which by `input`. */
  resolve: (value: boolean | string | null) => void;
}

type Listener = (request: ConfirmRequest | null) => void;

let current: ConfirmRequest | null = null;
const queue: ConfirmRequest[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(current));
}

function advance() {
  current = queue.shift() ?? null;
  emit();
}

/**
 * Queue rather than replace: two requests can legitimately overlap (e.g. a bulk action that asks
 * twice in quick succession), and dropping one would silently resolve a promise the caller is
 * still awaiting.
 */
function enqueue(request: ConfirmRequest) {
  if (current) queue.push(request);
  else {
    current = request;
    emit();
  }
}

/**
 * Ask the user to confirm. Resolves `true` if they confirm, `false` if they cancel, dismiss with
 * Escape, or press the backdrop. Never rejects — the caller's guard stays a plain boolean check
 * rather than a try/catch.
 */
export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    enqueue({
      id: nextId++,
      title: message,
      body: opts.body,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      tone: opts.tone ?? 'default',
      resolve: (value) => resolve(value === true),
    });
  });
}

/**
 * Promise-based replacement for `window.prompt`, one step further along the same argument as
 * `confirmDialog`: the native version takes free text with no label, no validation and no way to
 * tell a cancel from a deliberately blank answer.
 *
 *   const name = await promptDialog('Rename the table', { input: { label: 'Table name', required: true } });
 *   if (name === null) return; // cancelled — do nothing
 *
 * `null` means cancelled and `''` means deliberately blank, and the two are not the same
 * decision. Callers that do not care can collapse them; a caller writing to an audit trail
 * must not.
 */
export function promptDialog(message: string, opts: PromptOptions = {}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    enqueue({
      id: nextId++,
      title: message,
      body: opts.body,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      tone: opts.tone ?? 'default',
      input: opts.input ?? { label: 'Answer' },
      resolve: (value) => resolve(typeof value === 'string' ? value : null),
    });
  });
}

/** Resolve the open request and show the next queued one. Called by `ConfirmHost`. */
export function resolveConfirm(id: number, value: boolean | string | null) {
  if (!current || current.id !== id) return;
  current.resolve(value);
  advance();
}

/** Subscribe to the currently displayed request. Used by `ConfirmHost`. */
export function useConfirmRequest(): ConfirmRequest | null {
  const [request, setRequest] = useState<ConfirmRequest | null>(current);
  useEffect(() => {
    listeners.add(setRequest);
    setRequest(current);
    return () => {
      listeners.delete(setRequest);
    };
  }, []);
  return request;
}
