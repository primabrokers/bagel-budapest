import { useState, type FormEvent } from 'react';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import { inviteFamilyMember, removeFamilyMember } from '../../data/event/mutations';
import type { EventMemberRow } from '../../data/event/types';

interface FamilyAccessSectionProps {
  members: EventMemberRow[];
  onChanged: () => void;
}

/** Who can plan this Bar Mitzvah: every claimed and pending `bm_event_members` row, plus an
 *  invite-by-email mini form. Every signed-in family member has full access — this is about who
 *  can get in at all, not permissions once they're in. */
export function FamilyAccessSection({ members, onChanged }: FamilyAccessSectionProps) {
  const { eventId } = useEventContext();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showToast('Enter an email address to invite.', 'error');
      return;
    }
    setInviting(true);
    try {
      await inviteFamilyMember(eventId, trimmedEmail, displayName.trim() || undefined);
      setEmail('');
      setDisplayName('');
      showToast('Invited', 'success');
      onChanged();
    } catch {
      showToast('Could not invite — check the email and try again.', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: EventMemberRow) {
    const label = member.display_name || member.invited_email || 'this family member';
    const ok = await confirmDialog(`Remove ${label}?`, {
      body: 'They will lose access to the planner.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusyId(member.id);
    try {
      await removeFamilyMember(member.id);
      showToast('Removed', 'success');
      onChanged();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-text-primary">Family access</h2>

      {members.length === 0 ? (
        <EmptyState compact icon={UserPlus} title="No one else has access yet" />
      ) : (
        <ul className="mb-4 flex flex-col divide-y divide-separator">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {member.user_id ? member.display_name || 'Family member' : member.invited_email}
                  </p>
                  <Badge variant={member.user_id ? 'success' : 'warning'}>
                    {member.user_id ? 'Joined' : 'Pending'}
                  </Badge>
                </div>
              </div>
              <IconButton
                label={`Remove ${member.display_name || member.invited_email || 'family member'}`}
                size="sm"
                disabled={busyId !== null}
                onClick={() => void handleRemove(member)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="flex flex-col gap-3 border-t border-separator pt-4">
        <p className="text-sm font-medium text-text-secondary">Invite by email</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
            />
          </Field>
          <Field label="Display name" htmlFor="invite-name" hint="Optional">
            <Input id="invite-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={inviting} className="self-start">
          <Mail size={15} aria-hidden="true" />
          {inviting ? 'Inviting…' : 'Invite'}
        </Button>
      </form>
    </Card>
  );
}
