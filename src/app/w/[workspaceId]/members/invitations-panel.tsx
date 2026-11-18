'use client';

import { useState } from 'react';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Invitation = { id: string; expiresAt: string };

const formatExpiry = (iso: string) => {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return { day, full: `${day}, ${time} UTC` };
};

/** Pending Invitations and the create action. The link of a new Invitation lives in this component's memory only; it is never listed again. */
export function InvitationsPanel({ workspaceId, initialInvitations }: { workspaceId: string; initialInvitations: Invitation[] }) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`;

  async function create() {
    setBusy(true); setError(''); setStatus(''); setLink(null);
    try {
      const response = await fetch(base, { method: 'POST' });
      if (!response.ok) throw new Error(String(response.status));
      const created = (await response.json()) as { id: string; link: string; expiresAt: string };
      setLink(created.link);
      setInvitations(current => [...current, { id: created.id, expiresAt: created.expiresAt }].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)));
      setStatus('Invitation created. Copy the link now: it is shown only once.');
    } catch {
      setError('Could not create the invitation. You may no longer be an Owner of this workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    setError('');
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Link copied');
    } catch {
      setError('Could not copy automatically. Select the link and copy it manually.');
    }
  }

  async function revoke(id: string) {
    setError(''); setStatus('');
    try {
      const response = await fetch(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
      setInvitations(current => current.filter(invitation => invitation.id !== id));
      setStatus('Invitation revoked.');
    } catch {
      setError('Could not revoke the invitation. Try again.');
    }
  }

  return (
    <section aria-labelledby="pending-invitations-heading" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pending-invitations-heading" className="text-xl font-semibold tracking-tight">Pending invitations</h2>
        <Button type="button" onClick={create} disabled={busy} className="h-9 rounded-full px-4">
          <Link2 aria-hidden="true" className="size-4" />
          Create invitation link
        </Button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        A link is single-use, valid for 7 days, and lets one person create an account and join as a Member. It is shown once; if you lose it, revoke it and create a new one.
      </p>

      <div role="status" className="mt-3 min-h-5 text-sm text-muted-foreground">{status}</div>
      <div role="alert" className="text-sm text-destructive">{error}</div>

      {link && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border bg-card/60 p-4 sm:flex-row sm:items-center">
          <label htmlFor="invitation-link" className="sr-only">Invitation link</label>
          <input
            id="invitation-link"
            type="text"
            readOnly
            value={link}
            onFocus={event => event.currentTarget.select()}
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" variant="outline" onClick={copy} className="h-9 rounded-full px-4">
            {status === 'Link copied' ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            Copy link
          </Button>
        </div>
      )}

      {invitations.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No pending invitations.</p>
      ) : (
        <ul className="mt-4 grid gap-3" aria-label="Pending invitations">
          {invitations.map(invitation => {
            const expiry = formatExpiry(invitation.expiresAt);
            return (
              <li key={invitation.id} className="flex items-center gap-3 rounded-2xl border bg-card/60 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">Expires {expiry.full}</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-label={`Revoke invitation expiring ${expiry.full}`}
                  onClick={() => revoke(invitation.id)}
                >
                  <Trash2 aria-hidden="true" />
                  Revoke
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
