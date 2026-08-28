import { LogOut, MailQuestion } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { supabase } from '../../lib/supabase';

/**
 * A signed-in account with no claimed or invitable membership on any event. Protects the shared
 * Supabase project from a stranger signing up and landing inside someone else's Bar Mitzvah.
 *
 * Rendered by AppShell in place of the shell chrome whenever `ensureEventProvisioned()` resolves
 * to `null` (or throws — see AppShell's own comment on why an unexpected error falls back here
 * too, rather than to a separate error state).
 */
export function NoAccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card padding="lg" shadow="md" className="w-full max-w-sm text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gold-50 text-gold-700"
        >
          <MailQuestion size={22} />
        </span>
        <h1 className="text-lg font-semibold text-text-primary">Not linked to an event yet</h1>
        <p className="mt-2 text-sm text-text-muted">
          You&rsquo;re signed in, but this account isn&rsquo;t linked to a Bar Mitzvah yet. Ask a
          family member who is already planning one to invite you by email from Settings &rarr;
          Family access.
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => void supabase.auth.signOut()}>
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </Button>
      </Card>
    </div>
  );
}
