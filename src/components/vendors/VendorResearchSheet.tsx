import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../../hooks/useToast';
import { VENDOR_CATEGORIES } from '../../lib/vendors/categories';
import {
  dismissCandidate,
  fetchOpenCandidates,
  promoteCandidate,
  researchVendors,
  type VendorCandidateRow,
} from '../../data/vendors/research';

/**
 * Find suppliers, then decide about them.
 *
 * The review step is not a nicety. Everything on this screen was written by strangers on web pages
 * and summarised by a model — so a suggestion is exactly that until a person promotes it, and
 * nothing here contacts anybody. Each candidate shows the page it came from, so a claim can be
 * checked before it is acted on.
 */

interface VendorResearchSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** Where to look — the venue's town, usually. */
  defaultArea: string;
  onPromoted: () => void;
}

export function VendorResearchSheet({ open, onClose, eventId, defaultArea, onPromoted }: VendorResearchSheetProps) {
  const [category, setCategory] = useState<string>(VENDOR_CATEGORIES[1]);
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<VendorCandidateRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCandidates(await fetchOpenCandidates(eventId));
    } catch {
      // A failed reload is not worth a toast — the list simply stays as it was.
    }
  }, [eventId]);

  useEffect(() => {
    if (!open) return;
    setArea((current) => current || defaultArea);
    void reload();
  }, [open, defaultArea, reload]);

  async function handleSearch() {
    if (searching) return;
    setSearching(true);
    setError(null);
    try {
      const outcome = await researchVendors({ eventId, category, area, notes: notes.trim() || undefined });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      showToast(`Found ${outcome.candidates.length} to look at`, 'success');
      await reload();
    } finally {
      setSearching(false);
    }
  }

  async function handlePromote(candidate: VendorCandidateRow) {
    setBusyId(candidate.id);
    try {
      await promoteCandidate(eventId, candidate);
      showToast(`${candidate.name} added to your vendors`, 'success');
      await reload();
      onPromoted();
    } catch {
      showToast('Could not add that supplier — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(candidate: VendorCandidateRow) {
    setBusyId(candidate.id);
    try {
      await dismissCandidate(candidate.id);
      await reload();
    } catch {
      showToast('Could not dismiss that suggestion — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Find suppliers"
      anchor="drawer"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleSearch()} disabled={searching || !area.trim()}>
            <Search size={14} aria-hidden="true" />
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="What are you looking for?" htmlFor="research-category">
            <Select id="research-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Where" htmlFor="research-area" required>
            <Input id="research-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Borehamwood, Hertfordshire" />
          </Field>
        </div>

        <Field label="Anything particular?" htmlFor="research-notes" hint="Optional — budget, kashrus, style, dates">
          <Textarea id="research-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-text">
            {error}
          </p>
        )}

        <div className="border-t border-separator pt-4">
          <p className="mb-1 text-sm font-medium text-text-secondary">Suggestions</p>
          <p className="mb-3 text-xs text-text-muted">
            Found on the web and summarised automatically — check the source before you rely on any of it. Nothing here has
            been contacted.
          </p>

          {candidates.length === 0 ? (
            <EmptyState title="Nothing to review" hint="Run a search and suggestions will appear here." compact />
          ) : (
            <ul className="flex flex-col gap-3">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="rounded-lg border border-separator-soft bg-canvas-raised p-3">
                  <p className="text-sm font-semibold text-text-primary">{candidate.name}</p>
                  <p className="text-xs text-text-muted">{candidate.category}</p>
                  {candidate.summary && <p className="mt-1 text-sm text-text-secondary">{candidate.summary}</p>}

                  <dl className="mt-2 flex flex-col gap-0.5 text-xs text-text-secondary">
                    {candidate.phone && <div>{candidate.phone}</div>}
                    {candidate.email && <div>{candidate.email}</div>}
                    {candidate.address && <div>{candidate.address}</div>}
                  </dl>

                  {candidate.source_url && (
                    <a
                      href={candidate.source_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-plum-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      Where this came from
                    </a>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void handlePromote(candidate)} disabled={busyId === candidate.id}>
                      Add to vendors
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleDismiss(candidate)}
                      disabled={busyId === candidate.id}
                    >
                      Not this one
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
