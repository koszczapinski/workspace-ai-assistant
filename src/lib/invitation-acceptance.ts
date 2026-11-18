import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashInvitationToken } from './invitations';

export const INVALID_LINK_MESSAGE = 'This invitation link is not valid. Ask for a new invitation.';
export const GENERIC_FAILURE_MESSAGE = 'We could not create your account with those details. Check them and try again.';

const acceptBody = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1, 'Enter your name.').max(100, 'Use at most 100 characters for your name.'),
  email: z.string().trim().toLowerCase().max(254, 'Enter a valid email address.').pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'Use at least 8 characters for your password.').max(128, 'Use at most 128 characters for your password.'),
});

export type AcceptResult =
  | { kind: 'accepted'; workspaceId: string }
  | { kind: 'invalid-link' }
  | { kind: 'email-unavailable' };

export type AcceptanceStore = {
  /** Workspace name for a pending, unexpired Invitation; null otherwise. */
  findPending: (tokenHash: string, now: Date) => Promise<{ workspaceId: string; workspaceName: string } | null>;
  /**
   * One atomic step: consumes the Invitation, creates the User with a credential account and the Member Membership.
   * An email that already has an account leaves the Invitation unconsumed.
   */
  acceptWithAccount: (input: {
    tokenHash: string; now: Date; userId: string; name: string; email: string; passwordHash: string;
  }) => Promise<AcceptResult>;
};

type Deps = {
  store: Pick<AcceptanceStore, 'acceptWithAccount'>;
  hashPassword: (password: string) => Promise<string>;
  /** Signs the new User in; returns the headers (Set-Cookie) to forward, or null when sign-in failed. */
  signIn: (email: string, password: string) => Promise<Headers | null>;
  now?: () => Date;
  newId?: () => string;
};

/** Public Invitation acceptance. The body supplies only the token and the invitee's own details; the Workspace and role come from the stored Invitation. */
export function createAcceptInvitationHandler({ store, hashPassword, signIn, now = () => new Date(), newId = randomUUID }: Deps) {
  return async function accept(request: Request): Promise<Response> {
    let raw: unknown;
    try { raw = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }

    const parsed = acceptBody.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!(key in fields)) fields[key] = issue.message;
      }
      if ('token' in fields) return Response.json({ error: INVALID_LINK_MESSAGE, code: 'invalid-link' }, { status: 404 });
      return Response.json({ error: 'Check the highlighted details.', fields }, { status: 400 });
    }

    const { token, name, email, password } = parsed.data;
    const result = await store.acceptWithAccount({
      tokenHash: hashInvitationToken(token), now: now(), userId: newId(), name, email, passwordHash: await hashPassword(password),
    });
    if (result.kind === 'invalid-link') return Response.json({ error: INVALID_LINK_MESSAGE, code: 'invalid-link' }, { status: 404 });
    if (result.kind === 'email-unavailable') return Response.json({ error: GENERIC_FAILURE_MESSAGE }, { status: 400 });

    const cookies = await signIn(email, password);
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    cookies?.getSetCookie().forEach(cookie => headers.append('Set-Cookie', cookie));
    return Response.json({ workspaceId: result.workspaceId, signedIn: cookies !== null }, { status: 201, headers });
  };
}
