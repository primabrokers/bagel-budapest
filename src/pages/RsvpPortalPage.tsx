import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Frown, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Select, Textarea } from '../components/ui/Field';
import { Toggle } from '../components/ui/Toggle';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { supabasePublic } from '../lib/supabasePublic';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import { InvitationRenderer, type InvitationRendererEvent } from '../components/invitations/InvitationRenderer';
import { invitationAssetUrl } from '../lib/invitations/assetUrl';
import { parseInvitationDesignSpec } from '../lib/invitations/designSpec';
import { createDefaultInvitationDesign } from '../data/invitations/types';

/* -----------------------------------------------------------------------------------------------
   Local types for `bm_rsvp_get`'s jsonb response — see the RPC body in migration 3
   (supabase/migrations/20260828030200_bm_invitations_rsvp.sql). This is NOT `EventRow`/
   `GuestRow`/etc from `data/event`/`data/guests` — those are the authenticated tables' shapes,
   and this page reaches none of them; it is a plain jsonb object built field-by-field inside the
   RPC, so its own shape is defined here, once, next to the one place that reads it.
----------------------------------------------------------------------------------------------- */

interface PortalEvent {
  title: string;
  boy_name: string;
  boy_hebrew_name: string | null;
  event_date: string;
  hebrew_date_override: string | null;
  venue_name: string | null;
  venue_address: string | null;
  palette: { primaryHex?: string; accentHex?: string } | null;
  monogram_path: string | null;
  logo_path: string | null;
}

interface PortalHousehold {
  id: string;
  name: string;
  message_to_hosts: string | null;
}

interface PortalFunction {
  id: string;
  name: string;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  dress_code: string | null;
  hebrew_date_override: string | null;
  sort_order: number;
}

type PortalRsvp = 'awaiting' | 'attending' | 'declined' | 'unsure';

interface PortalInvite {
  function_id: string;
  invited: boolean;
  rsvp: PortalRsvp;
}

interface PortalGuest {
  id: string;
  first_name: string;
  last_name: string | null;
  guest_type: 'adult' | 'child';
  age: number | null;
  dietary: string | null;
  allergies: string | null;
  meal_preference: string | null;
  child_meal: boolean;
  high_chair: boolean;
  baby_seat: boolean;
  accessibility: string | null;
  invites: PortalInvite[];
}

interface RsvpGetResponse {
  event: PortalEvent;
  household: PortalHousehold;
  functions: PortalFunction[];
  guests: PortalGuest[];
}

interface GuestDraft {
  guest_id: string;
  dietary: string;
  allergies: string;
  meal_preference: string;
  child_meal: boolean;
  high_chair: boolean;
  accessibility: string;
  /** function_id -> the guest's current RSVP for it — seeded from the guest's existing invite so
   *  resubmitting without touching a chip keeps the value it already had, never silently resets
   *  it to 'awaiting'. */
  invites: Record<string, PortalRsvp>;
}

function guestName(guest: Pick<PortalGuest, 'first_name' | 'last_name'>): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(' ');
}

function toDraft(guest: PortalGuest): GuestDraft {
  const invites: Record<string, PortalRsvp> = {};
  for (const invite of guest.invites) {
    if (invite.invited) invites[invite.function_id] = invite.rsvp;
  }
  return {
    guest_id: guest.id,
    dietary: guest.dietary ?? '',
    allergies: guest.allergies ?? '',
    meal_preference: guest.meal_preference ?? '',
    child_meal: guest.child_meal,
    high_chair: guest.high_chair,
    accessibility: guest.accessibility ?? '',
    invites,
  };
}

/** The portal's own default design — every block the family's chosen template would show, minus
 *  the RSVP button: this whole page IS the RSVP form, so a CTA pointing at nothing (or at
 *  itself) has no useful target. The public portal never resolves the household's actual
 *  configured template — there is no RPC path to it, and anon has no table policy on
 *  `bm_invitation_templates` (migration 3's RLS is authenticated-only, by design) — so this
 *  synthesized default is deliberately what every guest sees, regardless of what a family member
 *  designed in `TemplateDesigner`. */
function portalDesign() {
  const design = createDefaultInvitationDesign();
  return { ...design, blocks: design.blocks.filter((b) => b.kind !== 'rsvp_cta') };
}

const MEAL_OPTIONS = [
  { value: '', label: 'No preference set' },
  { value: 'standard', label: 'Standard' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'other', label: 'Other (see notes)' },
];

const RSVP_CHOICES: { value: PortalRsvp; label: string; activeClass: string }[] = [
  { value: 'attending', label: 'Attending', activeClass: 'border-success-fg bg-success-bg text-success-text' },
  { value: 'unsure', label: 'Not sure yet', activeClass: 'border-warning-fg bg-warning-bg text-warning-text' },
  { value: 'declined', label: "Can't make it", activeClass: 'border-danger-fg bg-danger-bg text-danger-text' },
];

interface GuestRsvpCardProps {
  guest: PortalGuest;
  functions: PortalFunction[];
  draft: GuestDraft;
  onChange: (next: GuestDraft) => void;
  onFirstInteraction: () => void;
}

function GuestRsvpCard({ guest, functions, draft, onChange, onFirstInteraction }: GuestRsvpCardProps) {
  const invitedFunctions = functions.filter((fn) => draft.invites[fn.id] !== undefined);

  function set<K extends keyof GuestDraft>(key: K, value: GuestDraft[K]) {
    onFirstInteraction();
    onChange({ ...draft, [key]: value });
  }

  function setRsvp(functionId: string, rsvp: PortalRsvp) {
    onFirstInteraction();
    onChange({ ...draft, invites: { ...draft.invites, [functionId]: rsvp } });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-separator bg-surface p-4">
      <p className="text-sm font-semibold text-text-primary">
        {guestName(guest)}
        {guest.guest_type === 'child' && <span className="ml-1.5 text-xs font-normal text-text-muted">(child)</span>}
      </p>

      {invitedFunctions.length > 0 && (
        <div className="flex flex-col gap-3">
          {invitedFunctions.map((fn) => (
            <div key={fn.id} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-text-secondary">{fn.name}</p>
              <div className="flex flex-wrap gap-2">
                {RSVP_CHOICES.map((choice) => {
                  const active = draft.invites[fn.id] === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRsvp(fn.id, choice.value)}
                      className={cn(
                        'min-h-[44px] rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
                        active ? choice.activeClass : 'border-separator-control bg-surface text-text-secondary hover:bg-hover',
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-separator-soft pt-3">
        <Field label="Meal preference" htmlFor={`meal-${guest.id}`}>
          <Select id={`meal-${guest.id}`} value={draft.meal_preference} onChange={(e) => set('meal_preference', e.target.value)}>
            {MEAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dietary requirements" htmlFor={`dietary-${guest.id}`} hint="Optional — anything else we should know">
          <Textarea id={`dietary-${guest.id}`} value={draft.dietary} onChange={(e) => set('dietary', e.target.value)} rows={2} />
        </Field>
        <Field label="Allergies" htmlFor={`allergies-${guest.id}`}>
          <Textarea id={`allergies-${guest.id}`} value={draft.allergies} onChange={(e) => set('allergies', e.target.value)} rows={2} />
        </Field>
        <Field label="Accessibility needs" htmlFor={`accessibility-${guest.id}`}>
          <Textarea id={`accessibility-${guest.id}`} value={draft.accessibility} onChange={(e) => set('accessibility', e.target.value)} rows={2} />
        </Field>
        {guest.guest_type === 'child' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
              <span className="text-sm text-text-secondary">Needs a children's meal</span>
              <Toggle checked={draft.child_meal} onChange={(v) => set('child_meal', v)} label={`${guestName(guest)} needs a children's meal`} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
              <span className="text-sm text-text-secondary">Needs a high chair</span>
              <Toggle checked={draft.high_chair} onChange={(v) => set('high_chair', v)} label={`${guestName(guest)} needs a high chair`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The public RSVP portal — reached by an anonymous guest with no account, at `/rsvp/:token`
 * (outside `AppShell`, see routes.tsx). Everything here goes through `supabasePublic` calling the
 * three `SECURITY DEFINER` RPCs (`bm_rsvp_get`/`bm_rsvp_submit`/`bm_rsvp_track`, migration 3) —
 * never the authenticated `supabase` client, which this page never imports.
 */
export function RsvpPortalPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [response, setResponse] = useState<RsvpGetResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GuestDraft>>({});
  const [messageToHosts, setMessageToHosts] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trackedRef = useRef(false);

  const design = useMemo(() => portalDesign(), []);

  function applyResponse(data: RsvpGetResponse) {
    setResponse(data);
    setMessageToHosts(data.household.message_to_hosts ?? '');
    const nextDrafts: Record<string, GuestDraft> = {};
    for (const guest of data.guests) nextDrafts[guest.id] = toDraft(guest);
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabasePublic.rpc('bm_rsvp_get', { p_token: token });
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        applyResponse(data as unknown as RsvpGetResponse);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function trackClickOnce() {
    if (trackedRef.current || !token) return;
    trackedRef.current = true;
    void supabasePublic.rpc('bm_rsvp_track', { p_token: token, p_kind: 'rsvp_clicked' });
  }

  async function handleSubmit() {
    if (!token || !response) return;
    setSubmitting(true);
    try {
      const payload = {
        message_to_hosts: messageToHosts,
        guests: response.guests.map((guest) => {
          const draft = drafts[guest.id];
          return {
            guest_id: draft.guest_id,
            // Sent directly, never `|| null` — the RPC's `coalesce(v_guest->>'field', field)`
            // treats a JSON null as "leave unchanged", so a deliberately-cleared text field must
            // still arrive as a real (possibly empty) string or the clear would silently be lost.
            dietary: draft.dietary,
            allergies: draft.allergies,
            meal_preference: draft.meal_preference,
            child_meal: draft.child_meal,
            high_chair: draft.high_chair,
            accessibility: draft.accessibility,
            invites: Object.entries(draft.invites).map(([function_id, rsvp]) => ({ function_id, rsvp })),
          };
        }),
      };
      const { data, error } = await supabasePublic.rpc('bm_rsvp_submit', { p_token: token, p_payload: payload });
      if (error || !data) throw error ?? new Error('No response');
      applyResponse(data as unknown as RsvpGetResponse);
      showToast('Thank you — your RSVP has been saved.', 'success');
    } catch {
      showToast('Could not save your RSVP — please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center gap-4 bg-canvas p-4 pt-10">
        <Skeleton className="h-64 w-full max-w-md rounded-xl" />
        <Skeleton className="h-40 w-full max-w-md rounded-xl" />
      </div>
    );
  }

  if (notFound || !response) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-sm rounded-xl border border-separator bg-surface p-8 text-center shadow-sm">
          <span aria-hidden="true" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger-bg text-danger-text">
            <Frown size={22} />
          </span>
          <h1 className="font-display text-xl font-semibold text-plum-800">This link isn't working</h1>
          <p className="mt-2 text-sm text-text-muted">
            This RSVP link may have expired or been mistyped. Please double-check the link, or get in touch with the family
            directly.
          </p>
        </div>
      </div>
    );
  }

  const rendererEvent: InvitationRendererEvent = {
    title: response.event.title,
    boy_name: response.event.boy_name,
    boy_hebrew_name: response.event.boy_hebrew_name,
    event_date: response.event.event_date,
    hebrew_date_override: response.event.hebrew_date_override,
    venue_name: response.event.venue_name,
    venue_address: response.event.venue_address,
    palette: response.event.palette,
  };

  const invitedGuests = response.guests.filter((g) => g.invites.some((i) => i.invited));

  return (
    <div className="flex min-h-dvh flex-col items-center gap-5 bg-canvas p-4 pb-10 pt-6">
      <div className="flex w-full max-w-md items-center gap-2 text-plum-700">
        <Sparkles size={16} aria-hidden="true" />
        <span className="font-sans text-xs font-semibold uppercase tracking-[.08em]">You're invited</span>
      </div>

      <InvitationRenderer
        event={rendererEvent}
        design={design}
        householdName={response.household.name}
        backgroundUrl={invitationAssetUrl(parseInvitationDesignSpec(design.generated?.spec).spec?.backgroundAssetPath)}
        className="w-full max-w-md"
      />

      {response.functions.length > 0 && (
        <div className="w-full max-w-md rounded-xl border border-separator bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">The day</h2>
          <ul className="flex flex-col gap-2">
            {response.functions.map((fn) => (
              <li key={fn.id} className="text-sm">
                <p className="font-medium text-text-primary">{fn.name}</p>
                <p className="text-xs text-text-muted">
                  {fn.starts_at ? formatDateTime(fn.starts_at) : 'Time to be confirmed'}
                  {fn.location ? ` · ${fn.location}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-4">
        {invitedGuests.map((guest) => (
          <GuestRsvpCard
            key={guest.id}
            guest={guest}
            functions={response.functions}
            draft={drafts[guest.id]}
            onChange={(next) => setDrafts((d) => ({ ...d, [guest.id]: next }))}
            onFirstInteraction={trackClickOnce}
          />
        ))}
      </div>

      <div className="w-full max-w-md rounded-xl border border-separator bg-surface p-4">
        <Field label="A message for the hosts" htmlFor="message-to-hosts" hint="Optional">
          <Textarea
            id="message-to-hosts"
            value={messageToHosts}
            onChange={(e) => {
              trackClickOnce();
              setMessageToHosts(e.target.value);
            }}
            rows={3}
          />
        </Field>
      </div>

      <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="w-full max-w-md justify-center">
        {submitting ? 'Saving…' : 'Save RSVP'}
      </Button>
    </div>
  );
}
