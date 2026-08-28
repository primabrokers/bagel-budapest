import { useParams } from 'react-router-dom';
import { Frown } from 'lucide-react';
import { PrintPageLayout } from '../../components/print/PrintPageLayout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useEvent } from '../../data/event/hooks';
import { useGuestBook } from '../../data/guests/hooks';
import { useInvitationTemplates, useRsvpLinks } from '../../data/invitations/hooks';
import { createDefaultInvitationDesign } from '../../data/invitations/types';
import { InvitationRenderer, type InvitationRendererEvent } from '../../components/invitations/InvitationRenderer';

/** `bm-branding` is a PUBLIC bucket (migration 6) — a public URL is a pure string build, no
 *  network round trip, so this stays a plain synchronous helper rather than another `useFetch`
 *  call. Mirrors `InvitationsPage`'s identical helper — small enough that sharing it across the
 *  two would cost more (a new shared module, one more import) than it saves. */
function publicBrandingUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('bm-branding').getPublicUrl(path).data.publicUrl;
}

/**
 * `/print/invitation/:householdId` — one household's invitation, rendered full-size for a real
 * browser print (see `PrintPageLayout`). An ordinary authenticated page, inside `AppShell` like
 * every other route in `routes.tsx` except `/login` and `/rsvp/:token` — nothing here is reachable
 * without a session, unlike the public portal.
 *
 * Uses the event's DEFAULT invitation template when one exists, the same synthesized fallback
 * design the public portal itself renders when it doesn't — so what a family prints matches what
 * `RsvpPortalPage`'s header actually shows their guests, template or no template.
 */
export function InvitationPrintPage() {
  const { householdId } = useParams<{ householdId: string }>();
  const { data: event, loading: eventLoading } = useEvent();
  const { data: householdsData, loading: householdsLoading } = useGuestBook();
  const { data: templatesData } = useInvitationTemplates();
  const { data: linksData } = useRsvpLinks();

  const household = (householdsData ?? []).find((h) => h.id === householdId) ?? null;
  const defaultTemplate = (templatesData ?? []).find((t) => t.kind === 'invitation' && t.is_default) ?? null;
  const design = defaultTemplate?.design ?? createDefaultInvitationDesign();
  const link = (linksData ?? []).find((l) => l.household_id === householdId) ?? null;
  const rsvpHref = link ? `${window.location.origin}/rsvp/${link.token}` : null;

  const loading = eventLoading || householdsLoading;

  if (loading) {
    return (
      <PrintPageLayout title="Invitation">
        <Skeleton className="h-96 w-full rounded-xl" />
      </PrintPageLayout>
    );
  }

  if (!event || !household) {
    return (
      <PrintPageLayout title="Invitation">
        <EmptyState
          icon={Frown}
          title="Household not found"
          hint="This invitation can't be printed — the household may have been removed."
        />
      </PrintPageLayout>
    );
  }

  const rendererEvent: InvitationRendererEvent = {
    title: event.title,
    boy_name: event.boy_name,
    boy_hebrew_name: event.boy_hebrew_name,
    event_date: event.event_date,
    hebrew_date_override: event.hebrew_date_override,
    venue_name: event.venue_name,
    venue_address: event.venue_address,
    palette: event.palette,
  };

  return (
    <PrintPageLayout title={`Invitation — ${household.name}`}>
      <InvitationRenderer
        event={rendererEvent}
        design={design}
        householdName={household.name}
        rsvpHref={rsvpHref}
        photoUrl={publicBrandingUrl(event.logo_path)}
        monogramUrl={publicBrandingUrl(event.monogram_path)}
      />
    </PrintPageLayout>
  );
}
