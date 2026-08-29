import { useState, type FormEvent } from 'react';
import { Copy, Mail, Send, Trash2, UserPlus } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { confirmDialog } from '../../hooks/useConfirm';
import { useEventContext } from '../../data/event/context';
import {
  inviteFamilyMember,
  removeFamilyMember,
  resendFamilyInvite,
  type InviteDelivery,
} from '../../data/event/mutations';
import type { EventMemberRow } from '../../data/event/types';
import type { InviteMessage } from '../../lib/invites/inviteMessage';

interface FamilyAccessSectionProps {
  members: EventMemberRow[];
  boyName: string;
  onChanged: () => void;
}

/**
 * Who can plan this Bar Mitzvah: every claimed and pending `bm_event_members` row, plus an
 * invite-by-email form. Every signed-in family member has full access — this is about who can get
 * in at all, not permissions once they are in.
 *
 * The reason this screen carries so much explanatory text is that the invite mechanism is
 * invisible. There is no invite link with a token in it: the row records an email address, and
 * signing up with THAT address is what claims it. Somebody who signs up with a different address
 * gets a working app that shows them nothing. So the instruction has to reach them, and when
 * email is not configured the message is offered for copying rather than quietly dropped.
 */
export function FamilyAccessSection({ members, boyName, onChanged }: FamilyAccessSectionProps) {
  const { eventId } = useEventContext();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<{ email: string; message: InviteMessage } | null>(null);

  /** Where the invited person should go. Read from the browser so a preview deploy invites people
   *  to the preview, not to production. */
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function reportDelivery(delivery: InviteDelivery, to: string, message: InviteMessage) {
    if (delivery === 'emailed') {
      showToast(`Invite emailed to ${to}`, 'success');
      setPendingMessage(null);
      return;
    }
    // Not an error: the invite itself is live. They just have to be told about it by hand.
    setPendingMessage({ email: to, message });
    showToast(
      delivery === 'email_not_configured'
        ? 'Invite created — email is not set up, so send them the message below.'
        : 'Invite created, but the email would not send. Send them the message below.',
      'info',
    );
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showToast('Enter an email address to invite.', 'error');
      return;
    }
    setInviting(true);
    try {
      const result = await inviteFamilyMember(eventId, trimmedEmail, {
        displayName: displayName.trim() || undefined,
        boyName,
        appUrl,
      });
      setEmail('');
      setDisplayName('');
      onChanged();
      reportDelivery(result.delivery, result.member.invited_email ?? trimmedEmail, result.message);
    } catch (error) {
      showToast(
        error instanceof Error && error.message.includes('email address')
          ? error.message
          : 'Could not invite — check the email and try again.',
        'error',
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(member: EventMemberRow) {
    setBusyId(member.id);
    try {
      const { delivery, message } = await resendFamilyInvite(member, { boyName, appUrl });
      reportDelivery(delivery, member.invited_email ?? '', message);
    } catch {
      showToast('Could not send that invite again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(message: InviteMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      showToast('Invite copied — paste it into WhatsApp or a text', 'success');
    } catch {
      showToast('Could not copy. Select the text below instead.', 'error');
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
      <h2 className="mb-1 text-base font-semibold text-text-primary">Family access</h2>
      <p className="mb-4 max-w-prose text-xs text-text-muted">
        Anyone you add here can sign in and use the whole planner. They get in by signing up with the same email
        address you invite — the address has to match.
      </p>

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
                    {member.user_id ? 'Joined' : 'Waiting to sign up'}
                  </Badge>
                </div>
                {!member.user_id && member.invited_email && (
                  <p className="mt-0.5 text-xs text-text-muted">They need to sign up with this exact address.</p>
                )}
              </div>
              {!member.user_id && member.invited_email && (
                <IconButton
                  label={`Send the invite to ${member.invited_email} again`}
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void handleResend(member)}
                >
                  <Send size={14} aria-hidden="true" />
                </IconButton>
              )}
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

      {pendingMessage && (
        <div className="mb-4 rounded-lg border border-separator-soft bg-canvas-raised p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-secondary">Send this to {pendingMessage.email}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void handleCopy(pendingMessage.message)}>
              <Copy size={14} aria-hidden="true" />
              Copy
            </Button>
          </div>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs text-text-secondary">
            {pendingMessage.message.text}
          </pre>
        </div>
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
