import { cn } from '../../lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** An accessible switch — real `role="switch"` / `aria-checked`, not a checkbox styled to look
 *  like one, which a screen reader would announce as a checkbox and get the state model wrong. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
        'disabled:opacity-50 disabled:pointer-events-none',
        // The off state's border is `border-separator-strong`, the same control-boundary rung
        // Field's Input/Select/Textarea use — an off toggle is a control, not a decoration, and
        // needs the 3:1 WCAG 1.4.11 floor a plain `border-separator` divider does not clear.
        checked ? 'bg-plum-700' : 'border border-separator-strong bg-canvas',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
