import { describe, expect, it, vi } from 'vitest';
import { createAcceptInvitationHandler, type AcceptResult } from '../src/lib/invitation-acceptance';
import { hashInvitationToken } from '../src/lib/invitations';

const NOW = new Date('2030-01-01T00:00:00.000Z');

function setup(result: AcceptResult, signedIn = true) {
  const acceptWithAccount = vi.fn(async () => result);
  const signIn = vi.fn(async () => signedIn ? new Headers([['set-cookie', 'better-auth.session_token=abc; Path=/; HttpOnly']]) : null);
  const handler = createAcceptInvitationHandler({
    store: { acceptWithAccount }, hashPassword: async p => `hashed:${p}`, signIn, now: () => NOW, newId: () => 'new-user-id',
  });
  return { handler, acceptWithAccount, signIn };
}

const request = (body: unknown) => new Request('http://localhost:3000/api/invitations/accept', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const valid = { token: 'tok', name: ' Ada ', email: 'Ada@Example.test', password: 'long-enough-pw' };

describe('accept invitation', () => {
  it('creates the account from the form, signs the User in and answers with the Workspace', async () => {
    const { handler, acceptWithAccount, signIn } = setup({ kind: 'accepted', workspaceId: 'workspace-a' });
    const response = await handler(request(valid));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ workspaceId: 'workspace-a', signedIn: true });
    expect(response.headers.getSetCookie()[0]).toContain('better-auth.session_token');
    expect(acceptWithAccount).toHaveBeenCalledWith({
      tokenHash: hashInvitationToken('tok'), now: NOW, userId: 'new-user-id', name: 'Ada', email: 'ada@example.test', passwordHash: 'hashed:long-enough-pw',
    });
    expect(signIn).toHaveBeenCalledWith('ada@example.test', 'long-enough-pw');
  });

  it('ignores a submitted Workspace, role or user id', async () => {
    const { handler, acceptWithAccount } = setup({ kind: 'accepted', workspaceId: 'workspace-a' });
    await handler(request({ ...valid, workspaceId: 'workspace-b', role: 'owner', userId: 'x', id: 'y' }));
    expect(JSON.stringify(acceptWithAccount.mock.calls[0])).not.toMatch(/workspace-b|owner|"x"|"y"/);
  });

  it('still succeeds, without signing in, when the sign-in step fails', async () => {
    const { handler } = setup({ kind: 'accepted', workspaceId: 'workspace-a' }, false);
    const response = await handler(request(valid));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ signedIn: false });
  });

  it('gives readable field errors for unusable details and creates nothing', async () => {
    const { handler, acceptWithAccount } = setup({ kind: 'accepted', workspaceId: 'workspace-a' });
    const response = await handler(request({ token: 'tok', name: '', email: 'nope', password: 'short' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body.fields).sort()).toEqual(['email', 'name', 'password']);
    expect(acceptWithAccount).not.toHaveBeenCalled();
  });

  it('answers a malformed body with 400', async () => {
    const { handler } = setup({ kind: 'accepted', workspaceId: 'workspace-a' });
    const response = await handler(new Request('http://localhost/x', { method: 'POST', body: 'not json' }));
    expect(response.status).toBe(400);
  });

  it('answers an unknown, expired, revoked or used token with the neutral link-not-valid result', async () => {
    const { handler, signIn } = setup({ kind: 'invalid-link' });
    const response = await handler(request(valid));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe('invalid-link');
    expect(JSON.stringify(body)).not.toMatch(/workspace/i);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('fails generically for an email that already has an account, without saying why and without signing in', async () => {
    const { handler, signIn } = setup({ kind: 'email-unavailable' });
    const response = await handler(request(valid));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/exist|already|taken|registered/i);
    expect(body.fields).toBeUndefined();
    expect(signIn).not.toHaveBeenCalled();
  });
});
