import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';

type Mode = 'sign-in' | 'sign-up';

/**
 * Turn a Supabase auth error into something a family member can act on. Never the raw message —
 * GoTrue's own wording ("AuthApiError: Invalid login credentials") is written for a developer,
 * not a parent trying to get into a guest list the night before a deadline.
 */
function friendlyAuthError(mode: Mode, rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'That email or password is not right. Please try again.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account already exists for that email — try signing in instead.';
  }
  if (lower.includes('password') && (lower.includes('at least') || lower.includes('should be'))) {
    return 'That password is too short — use at least 6 characters.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts — please wait a moment and try again.';
  }
  if (lower.includes('email') && lower.includes('valid')) {
    return 'That doesn’t look like a valid email address.';
  }
  return mode === 'sign-in'
    ? 'Could not sign you in. Please check your details and try again.'
    : 'Could not create your account. Please try again.';
}

/**
 * Email/password sign-in AND sign-up, one page, toggled by `mode`. Renders at `/login`, outside
 * `AppShell`'s auth-gated layout. On success there is nothing further to do here: `AppShell`'s
 * own `onAuthStateChange` subscription picks up the new session and re-renders past this page.
 */
export function SignInPage() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } =
        mode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
          : await supabase.auth.signUp({ email: trimmedEmail, password });

      if (authError) {
        setError(friendlyAuthError(mode, authError.message));
        return;
      }

      if (mode === 'sign-up') {
        showToast('Account created — check your email if confirmation is needed.', 'success');
      }
    } catch {
      // A network failure, or the placeholder client this app falls back to when no real .env
      // exists yet (see lib/supabase.ts) — either way, never a raw error string on screen.
      setError(
        mode === 'sign-in'
          ? 'Could not sign you in. Please check your connection and try again.'
          : 'Could not create your account. Please check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* Monogram placeholder — the family's own boy's-name initial replaces the "D" once
              EventSettingsPage (Stage 3) has a real event to read it from. */}
          <span
            aria-hidden="true"
            className="grid h-14 w-14 place-items-center rounded-full bg-plum-700 font-display text-2xl font-semibold text-text-inverse"
          >
            D
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-plum-800">Bar Mitzvah Planner</h1>
            <p className="mt-1 text-sm text-text-muted">
              Guests, invitations, seating, budget — all in one place.
            </p>
          </div>
        </div>

        <Card padding="lg" shadow="md">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-text-primary">
              {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
            </h2>

            <Field label="Email" htmlFor="auth-email" required>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field label="Password" htmlFor="auth-password" required>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-text">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting
                ? mode === 'sign-in'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-text-muted">
          {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
              setError(null);
            }}
            className="rounded-sm font-medium text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
          >
            {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
