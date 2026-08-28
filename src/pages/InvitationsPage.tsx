import { useMemo, useState } from 'react';
import { Mail, Pencil, Plus, Send, Star } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { useEventContext } from '../data/event/context';
import { useEvent } from '../data/event/hooks';
import { useGuestBook } from '../data/guests/hooks';
import { supabase } from '../lib/supabase';
import { useInvitationEvents, useInvitationTemplates, useRsvpLinks } from '../data/invitations/hooks';
import { setDefaultTemplate } from '../data/invitations/mutations';
import { TemplateDesigner } from '../components/invitations/TemplateDesigner';
import { SendSheet } from '../components/invitations/SendSheet';
import type { InvitationRendererEvent } from '../components/invitations/InvitationRenderer';
import type { InvitationTemplateRow } from '../data/invitations/types';
import type { HouseholdWithGuests } from '../data/guests/types';

type Tab = 'templates' | 'send';

const TABS: TabItem<Tab>[] = [
  { key: 'templates', label: 'Templates' },
  { key: 'send', label: 'Send & track' },
];

const KIND_LABEL: Record<InvitationTemplateRow['kind'], string> = {
  invitation: 'Invitation',
  save_the_date: 'Save the date',
};

/** `bm-branding` is a PUBLIC bucket (see migration 6) — a public URL is a pure string build, no
 *  network call and no signed-URL expiry to worry about, unlike the private `bm-documents`/
 *  `bm-idea-images` buckets elsewhere in this app. */
function publicBrandingUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('bm-branding').getPublicUrl(path).data.publicUrl;
}

export function InvitationsPage() {
  const { eventId } = useEventContext();
  const { data: event, loading: eventLoading } = useEvent();
  const { data: householdsData, loading: householdsLoading } = useGuestBook();
  const { data: templatesData, loading: templatesLoading, reload: reloadTemplates } = useInvitationTemplates();
  const { data: linksData } = useRsvpLinks();
  const { data: eventsData, reload: reloadEvents } = useInvitationEvents();

  const [tab, setTab] = useState<Tab>('templates');
  const [designerState, setDesignerState] = useState<{ template: InvitationTemplateRow | null } | null>(null);
  const [sendState, setSendState] = useState<{ household: HouseholdWithGuests } | null>(null);
  const [defaultBusyId, setDefaultBusyId] = useState<string | null>(null);

  const households = householdsData ?? [];
  const templates = templatesData ?? [];
  const links = useMemo(() => linksData ?? [], [linksData]);
  const events = useMemo(() => eventsData ?? [], [eventsData]);

  const defaultInvitationTemplate = templates.find((t) => t.kind === 'invitation' && t.is_default) ?? null;

  const linkByHousehold = useMemo(() => new Map(links.map((l) => [l.household_id, l] as const)), [links]);
  const sentHouseholdIds = useMemo(
    () => new Set(events.filter((e) => e.kind === 'sent').map((e) => e.household_id)),
    [events],
  );
  const completedHouseholdIds = useMemo(
    () => new Set(events.filter((e) => e.kind === 'completed').map((e) => e.household_id)),
    [events],
  );

  const rendererEvent: InvitationRendererEvent | null = event
    ? {
        title: event.title,
        boy_name: event.boy_name,
        boy_hebrew_name: event.boy_hebrew_name,
        event_date: event.event_date,
        hebrew_date_override: event.hebrew_date_override,
        venue_name: event.venue_name,
        venue_address: event.venue_address,
        palette: event.palette,
      }
    : null;
  const photoUrl = publicBrandingUrl(event?.logo_path);
  const monogramUrl = publicBrandingUrl(event?.monogram_path);

  async function handleSetDefault(template: InvitationTemplateRow) {
    setDefaultBusyId(template.id);
    try {
      await setDefaultTemplate(template.id);
      reloadTemplates();
      showToast('Set as default', 'success');
    } catch {
      showToast('Could not set as default — please try again.', 'error');
    } finally {
      setDefaultBusyId(null);
    }
  }

  function rsvpUrlFor(household: HouseholdWithGuests): string | null {
    const link = linkByHousehold.get(household.id);
    if (!link) return null;
    return `${window.location.origin}/rsvp/${link.token}`;
  }

  const loading = eventLoading || householdsLoading || templatesLoading;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Invitations"
        subtitle="Design the invitation, then send and track every household's RSVP link."
        actions={
          tab === 'templates' ? (
            <Button type="button" onClick={() => setDesignerState({ template: null })} disabled={!rendererEvent}>
              <Plus size={15} aria-hidden="true" />
              Add template
            </Button>
          ) : undefined
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="Invitations view" variant="segmented" className="mb-4" />

      {loading && !rendererEvent ? (
        <Card>
          <Skeleton className="h-40 w-full rounded-lg" />
        </Card>
      ) : !rendererEvent ? (
        <EmptyState icon={Mail} title="Set up your event first" hint="Add the event's date and venue in Settings before designing invitations." />
      ) : tab === 'templates' ? (
        templates.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No templates yet"
            hint="Design an invitation or save-the-date — every household's RSVP link renders it automatically."
            action={
              <Button type="button" size="sm" onClick={() => setDesignerState({ template: null })}>
                <Plus size={14} aria-hidden="true" />
                Add template
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((template) => (
              <li key={template.id}>
                <Card padding="sm" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-text-primary">{template.name}</p>
                      <Badge variant="muted">{KIND_LABEL[template.kind]}</Badge>
                      {template.is_default && <Badge variant="gold">Default</Badge>}
                    </div>
                  </div>
                  {!template.is_default && (
                    <IconButton
                      label={`Set "${template.name}" as default`}
                      size="sm"
                      disabled={defaultBusyId !== null}
                      onClick={() => void handleSetDefault(template)}
                    >
                      <Star size={15} aria-hidden="true" />
                    </IconButton>
                  )}
                  <IconButton label={`Edit ${template.name}`} size="sm" onClick={() => setDesignerState({ template })}>
                    <Pencil size={15} aria-hidden="true" />
                  </IconButton>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : households.length === 0 ? (
        <EmptyState icon={Send} title="No households yet" hint="Add households on the Guests page first." />
      ) : (
        <ul className="flex flex-col gap-2">
          {households.map((household) => {
            const rsvpUrl = rsvpUrlFor(household);
            const completed = completedHouseholdIds.has(household.id);
            const sent = sentHouseholdIds.has(household.id);
            return (
              <li key={household.id}>
                <Card padding="sm" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{household.name}</p>
                    <div className="mt-1">
                      <Badge variant={completed ? 'success' : sent ? 'info' : 'muted'}>
                        {completed ? 'RSVP received' : sent ? 'Invitation sent' : 'Not sent yet'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!rsvpUrl}
                    onClick={() => setSendState({ household })}
                  >
                    <Send size={14} aria-hidden="true" />
                    Send
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {rendererEvent && (
        <TemplateDesigner
          open={designerState !== null}
          onClose={() => setDesignerState(null)}
          template={designerState?.template ?? null}
          event={rendererEvent}
          photoUrl={photoUrl}
          monogramUrl={monogramUrl}
          onSaved={reloadTemplates}
        />
      )}

      {sendState && (
        <SendSheet
          open={sendState !== null}
          onClose={() => setSendState(null)}
          mode="invite"
          household={sendState.household}
          eventId={eventId}
          boyName={event?.boy_name ?? ''}
          rsvpUrl={rsvpUrlFor(sendState.household) ?? ''}
          templateId={defaultInvitationTemplate?.id ?? null}
          onSent={reloadEvents}
        />
      )}
    </div>
  );
}
