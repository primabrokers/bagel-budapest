import { Settings } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { SkeletonText } from '../components/ui/Skeleton';
import { useEvent, useFamilyMembers, useFunctions } from '../data/event/hooks';
import { IdentitySection } from '../components/settings/IdentitySection';
import { DateVenueSection } from '../components/settings/DateVenueSection';
import { StyleSection } from '../components/settings/StyleSection';
import { FunctionsEditor } from '../components/settings/FunctionsEditor';
import { FamilyAccessSection } from '../components/settings/FamilyAccessSection';
import { ApiKeysSection } from '../components/settings/ApiKeysSection';
import { NotesSection } from '../components/settings/NotesSection';

export function SettingsPage() {
  const { data: event, loading, reload } = useEvent();
  const { data: functions, reload: reloadFunctions } = useFunctions();
  const { data: members, reload: reloadMembers } = useFamilyMembers();

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <PageHeader title="Settings" subtitle="Event details, functions, and who can help plan." />

      {loading && !event ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <SkeletonText lines={3} />
            </Card>
          ))}
        </div>
      ) : !event ? (
        <EmptyState icon={Settings} title="Couldn't load your event" hint="Try reloading the page." />
      ) : (
        <div className="flex flex-col gap-5">
          <IdentitySection event={event} onSaved={reload} />
          <DateVenueSection event={event} onSaved={reload} />
          <StyleSection event={event} onSaved={reload} />
          <FunctionsEditor functions={functions ?? []} onChanged={reloadFunctions} />
          <FamilyAccessSection members={members ?? []} boyName={event.boy_name} onChanged={reloadMembers} />
          <ApiKeysSection />
          <NotesSection event={event} onSaved={reload} />
        </div>
      )}
    </div>
  );
}
