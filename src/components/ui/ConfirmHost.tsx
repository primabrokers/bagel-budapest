import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Field, Input, Textarea } from './Field';
import { cn } from '../../lib/cn';
import { LAYER } from './Sheet';
import { useDialog } from '../../hooks/useDialog';
import { resolveConfirm, useConfirmRequest } from '../../hooks/useConfirm';

/**
 * Renders whatever `confirmDialog()` / `promptDialog()` currently has outstanding. Mounted once,
 * in the app shell, alongside `ToastHost`.
 *
 * Deliberately not a `<Sheet>`: this is driven by an imperative promise API, it has no close
 * button (a decision must be taken, not dismissed by X), and it sits on the `top` layer rung so
 * it can be opened over any sheet already on screen.
 *
 * It renders `promptDialog`'s single text field too. The role changes with it: `alertdialog` is
 * for a message that needs a response and nothing else, so a panel containing a form control is
 * a plain `dialog` instead.
 */
export function ConfirmHost() {
  const request = useConfirmRequest();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  const close = useCallback(
    (value: boolean | string | null) => {
      if (request) resolveConfirm(request.id, value);
    },
    [request],
  );

  // `enabled: !!request` matters more here than anywhere else: this host is mounted once in the
  // app shell and never unmounts, so an unguarded useDialog would hold body scroll locked and a
  // capture-phase Escape listener for the entire session with nothing on screen to explain it.
  // Escape and a backdrop press are a cancel, and a cancelled prompt is `null` — never `false`,
  // and never `''`, which is a real answer somebody typed nothing into on purpose.
  const { panelRef, backdropProps } = useDialog(
    () => close(request?.input ? null : false),
    { enabled: !!request },
  );

  // Focus the confirming button rather than the panel so Enter/Space act immediately. Cancel
  // would be the "safer" default to focus, but every one of these prompts is reached by an
  // explicit click on the action it is confirming, so the confirming button is the expected next
  // step, and Escape remains one key away for a change of mind.
  //
  // A prompt focuses its field instead — the answer is the thing being asked for, and landing on
  // the confirm button would make the first keystroke of a typed answer activate it. The default
  // value is selected rather than trailed, so typing replaces it the way `window.prompt` did.
  useEffect(() => {
    if (!request) return;
    setText(request.input?.defaultValue ?? '');
    setTouched(false);
    if (request.input) {
      const field = inputRef.current;
      field?.focus();
      field?.select();
    } else {
      confirmRef.current?.focus();
    }
  }, [request]);

  if (!request) return null;

  const danger = request.tone === 'danger';
  const { input } = request;
  const blank = text.trim() === '';
  const missing = !!input?.required && blank;
  const Control = input?.multiline ? Textarea : Input;

  return (
    <div
      {...backdropProps}
      className={cn('fixed inset-0 flex items-center justify-center bg-black/40 p-4', LAYER.top)}
    >
      <div
        ref={panelRef}
        role={input ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={request.body ? 'confirm-body' : undefined}
        className="w-full max-w-md overflow-hidden rounded-lg border border-separator bg-surface shadow-lg"
      >
        <div className="flex gap-3 p-5">
          {danger && (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger-fg"
            >
              <AlertTriangle size={16} />
            </span>
          )}
          {/* min-w-0 so a long unbroken name can truncate instead of forcing the panel wider
              than the phone screen. */}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-semibold text-text-primary">
              {request.title}
            </h2>
            {request.body && (
              <p id="confirm-body" className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-text-muted">
                {request.body}
              </p>
            )}
            {input && (
              <Field
                className="mt-3"
                label={input.label}
                htmlFor="confirm-input"
                required={input.required}
                // Only after the field has been touched: a required prompt opens blank by
                // definition, and an error shown before anyone has typed is scolding the user
                // for the dialog having just appeared.
                error={touched && missing ? (input.requiredMessage ?? 'This is required.') : undefined}
              >
                <Control
                  ref={inputRef as never}
                  id="confirm-input"
                  value={text}
                  invalid={touched && missing}
                  placeholder={input.placeholder}
                  aria-describedby={touched && missing ? 'confirm-input-error' : undefined}
                  onChange={(e) => {
                    setText(e.target.value);
                    setTouched(true);
                  }}
                  onBlur={() => setTouched(true)}
                  // Enter submits a single-line answer, as the native prompt did. A textarea
                  // keeps Enter for newlines — a reason is allowed to be two sentences.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !input.multiline && !missing) {
                      e.preventDefault();
                      close(text);
                    }
                  }}
                />
              </Field>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-separator bg-canvas px-5 py-3">
          <Button variant="secondary" size="sm" onClick={() => close(input ? null : false)}>
            {request.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            disabled={missing}
            onClick={() => close(input ? text : true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
