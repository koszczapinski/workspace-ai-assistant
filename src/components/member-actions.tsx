'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { MemberRole } from '@/lib/member-types';

type Props = {
  workspaceId: string;
  member: { userId: string; name: string; role: MemberRole };
  /** The row belongs to the signed-in Owner, so removal means leaving. */
  isSelf: boolean;
  /** This Member is the Workspace's only Owner; the server refuses to demote or remove them. */
  isLastOwner: boolean;
};

/** Owner-only actions on one Member row. The server re-checks everything; this is presentation only. */
export default function MemberActions({ workspaceId, member, isSelf, isLastOwner }: Props) {
  const router = useRouter();
  const noteId = useId();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const url = `/api/workspaces/${workspaceId}/members/${member.userId}`;

  async function run(init: RequestInit, done: string, afterSuccess: () => void) {
    setPending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? 'Something went wrong. Try again.');
        return;
      }
      setStatus(done);
      afterSuccess();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  const changeRole = (role: MemberRole) => run(
    { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) },
    `${member.name} is now ${role === 'owner' ? 'an Owner' : 'a Member'}.`,
    () => router.refresh(),
  );
  const remove = () => run(
    { method: 'DELETE' },
    isSelf ? 'You left the workspace.' : `${member.name} was removed.`,
    () => { if (isSelf) router.push('/'); else router.refresh(); },
  );

  const blocked = isLastOwner;
  const describedBy = blocked ? noteId : undefined;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2">
        {member.role === 'member' ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Make ${member.name} an Owner`} onClick={() => changeRole('owner')}>Make Owner</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={pending || blocked} aria-describedby={describedBy} aria-label={`Make ${member.name} a Member`} onClick={() => changeRole('member')}>Make Member</Button>
        )}
        <Button type="button" variant="destructive" size="sm" disabled={pending || blocked} aria-describedby={describedBy} aria-label={isSelf ? 'Leave workspace' : `Remove ${member.name}`} onClick={remove}>
          {isSelf ? 'Leave' : 'Remove'}
        </Button>
      </div>
      {blocked && <p id={noteId} className="text-xs text-muted-foreground">Last Owner: make another Member an Owner first.</p>}
      <p role="status" className="text-xs text-muted-foreground empty:hidden">{status}</p>
      <p role="alert" className="text-xs text-destructive empty:hidden">{error}</p>
    </div>
  );
}
