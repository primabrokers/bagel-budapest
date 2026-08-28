import {
  forwardRef,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-md border bg-surface px-3 py-2 text-base text-text-primary ' +
  'placeholder:text-text-faint transition-colors ' +
  'focus-visible:outline-none focus-visible:border-plum-400 focus-visible:ring-2 focus-visible:ring-plum-400/15 ' +
  'disabled:opacity-50 disabled:pointer-events-none';
// Not `border-separator` — that is the decorative-divider rung, nowhere near WCAG 1.4.11's 3:1
// floor for a control boundary against the field's own white fill. `border-separator-control` is
// solved specifically for that: see the derivation note in tokens.css.
const okBorder = 'border-separator-control';
const badBorder = 'border-danger-border focus-visible:border-danger-fg focus-visible:ring-danger-fg/15';

type WithInvalid = { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & WithInvalid>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        // `invalid` alone only paints a red border, which is the one cue a screen-reader user
        // cannot receive. aria-invalid carries the same state into the accessibility tree.
        aria-invalid={invalid || undefined}
        className={cn(control, invalid ? badBorder : okBorder, className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & WithInvalid>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, 'min-h-[88px] leading-relaxed', invalid ? badBorder : okBorder, className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & WithInvalid>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(control, 'appearance-none pr-9', invalid ? badBorder : okBorder, className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
      </div>
    );
  },
);

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  // Stable ids so a control can point at its own hint/error with aria-describedby:
  //   <Field htmlFor="guest-name" error={err}>
  //     <Input id="guest-name" aria-describedby={err ? 'guest-name-error' : 'guest-name-hint'} />
  // Only available when the caller gave the field an htmlFor — without one there is no id to
  // hang them off, and a guessed id would collide across repeated field groups (e.g. one row
  // per guest in a household sheet).
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
          {label}
          {/* Decorative: the control's own `required` is what assistive tech reads, so the
              asterisk would otherwise be announced as a stray "star" after every label. */}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-danger-fg">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        // role="alert" — validation failures appear after the fact (on submit, or on blur), so
        // they have to interrupt rather than wait to be navigated to.
        <p id={errorId} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
