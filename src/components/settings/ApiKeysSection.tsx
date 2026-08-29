import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { formatDate } from '../../lib/format';
import { clearApiKey, fetchApiKeys, setApiKey, type ApiKeyStatus } from '../../data/keys/apiKeys';

/**
 * Where the family pastes their own provider API keys.
 *
 * Two things about this screen are load-bearing rather than cosmetic.
 *
 * A key is never shown once saved — only the last four characters. There is no endpoint that
 * returns one, so this is not a display choice that a future change could quietly reverse; the
 * value genuinely cannot come back. The input is `type="password"` and `autoComplete="off"` so a
 * browser does not offer to remember it either.
 *
 * And nothing here writes to the database directly. The value goes to the `bm_ai_keys` edge
 * function, which is the only thing holding the service role key, and lands in Supabase Vault —
 * encrypted at rest, unreadable by the `authenticated` role this page runs as. A key pasted here
 * is no more exposed than one set in the Supabase dashboard.
 */
export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyStatus[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const outcome = await fetchApiKeys();
    if (outcome.ok) {
      setKeys(outcome.keys);
      setLoadError(null);
    } else {
      setKeys([]);
      setLoadError(outcome.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(key: ApiKeyStatus) {
    const value = (drafts[key.env] ?? '').trim();
    if (!value) {
      showToast('Paste a key first.', 'error');
      return;
    }
    setBusy(key.env);
    try {
      const outcome = await setApiKey(key.env, value);
      if (!outcome.ok) {
        showToast(outcome.message, 'error');
        return;
      }
      // Cleared immediately on success so the key does not sit in a form field, in the DOM, or in
      // a React DevTools tree any longer than the request itself.
      setDrafts((d) => ({ ...d, [key.env]: '' }));
      setKeys(outcome.keys);
      showToast(`${key.label} key saved`, 'success');
    } finally {
      setBusy(null);
    }
  }

  async function handleClear(key: ApiKeyStatus) {
    const ok = await confirmDialog(`Remove the ${key.label} key?`, {
      body: `${key.enables} will stop working until you add another one.`,
      tone: 'danger',
      confirmLabel: 'Remove key',
    });
    if (!ok) return;
    setBusy(key.env);
    try {
      const outcome = await clearApiKey(key.env);
      if (!outcome.ok) {
        showToast(outcome.message, 'error');
        return;
      }
      setKeys(outcome.keys);
      showToast('Key removed', 'success');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-base font-semibold text-text-primary">API keys</h2>
      <p className="mb-4 max-w-prose text-xs text-text-muted">
        The planner uses these to design invitations, make artwork, research suppliers and send email. You pay each
        provider directly. Keys are stored encrypted in Supabase Vault and are never shown again once saved — only
        the last four characters, so you can tell one from another.
      </p>

      {loadError && (
        <p role="alert" className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-text">
          {loadError}
        </p>
      )}

      {keys === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-text-muted">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Checking which keys are set…
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {keys.map((key) => {
            const working = busy === key.env;
            return (
              <li key={key.env} className="flex flex-col gap-2 py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{key.label}</p>
                  {key.isSet ? (
                    <Badge variant="success">
                      <Check size={11} aria-hidden="true" />
                      Set{key.last4 ? ` ····${key.last4}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="muted">Not set</Badge>
                  )}
                </div>

                <p className="text-xs text-text-muted">
                  {key.enables}.{' '}
                  <a
                    href={key.console}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-sm text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                  >
                    Get a key
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                  {key.isSet && key.updatedAt ? ` · Updated ${formatDate(key.updatedAt)}` : ''}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field
                    label={key.isSet ? 'Replace this key' : 'Paste your key'}
                    htmlFor={`key-${key.env}`}
                    className="min-w-0 flex-1"
                  >
                    <Input
                      id={`key-${key.env}`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[key.env] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key.env]: e.target.value }))}
                      placeholder={key.isSet ? 'Leave blank to keep the current key' : 'sk-…'}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSave(key)}
                      disabled={working || !(drafts[key.env] ?? '').trim()}
                    >
                      <KeyRound size={14} aria-hidden="true" />
                      {working ? 'Saving…' : 'Save'}
                    </Button>
                    {key.isSet && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => void handleClear(key)} disabled={working}>
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
