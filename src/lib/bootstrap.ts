import { randomUUID } from 'node:crypto';
import { parseConfirmDatabase } from './environment-guard';
import { issueInvitation, type InvitationStore } from './invitations';
import { workspaceNameSchema } from './workspace-settings';

export const DEFAULT_ASSISTANT_INSTRUCTIONS =
  'You are a helpful assistant for this Workspace. Answer clearly and concisely, and say so when you are not sure.';

/** What the bootstrap needs inside one database transaction. */
export type BootstrapTransaction = {
  /** Locks the Workspace table against concurrent bootstraps, then counts its rows. */
  countWorkspaces: () => Promise<number>;
  insertWorkspace: (workspace: { id: string; name: string; assistantInstructions: string }) => Promise<void>;
  createInvitation: InvitationStore['create'];
};

export type BootstrapStore = {
  /** Runs `fn` atomically: if it throws, nothing it wrote is kept. */
  transaction: <T>(fn: (tx: BootstrapTransaction) => Promise<T>) => Promise<T>;
};

/** Reads `--workspace <name>` (or `--workspace=<name>`) and `--confirm-database`; the name is validated like Workspace settings. */
export function parseBootstrapArgs(argv: readonly string[]): { workspaceName: string; confirmDatabase: string | undefined } {
  const flag = '--workspace';
  const missing = () => new Error(`${flag} needs a Workspace name, for example ${flag} "Acme"`);
  let raw: string | undefined;
  for (let i = 0; i < argv.length && raw === undefined; i++) {
    const arg = argv[i];
    if (arg.startsWith(`${flag}=`)) raw = arg.slice(flag.length + 1);
    else if (arg === flag) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw missing();
      raw = value;
    }
  }
  if (raw === undefined) throw missing();

  const parsed = workspaceNameSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid Workspace name.');
  return { workspaceName: parsed.data, confirmDatabase: parseConfirmDatabase(argv) };
}

/**
 * Creates the first Workspace and a single-use Owner Invitation, all in one transaction. Refuses, before writing,
 * when any Workspace exists. The link is built from the app's public base URL (BETTER_AUTH_URL) and is returned
 * to the caller only; the database holds just the token hash.
 */
export async function bootstrapWorkspace({
  store, workspaceName, publicBaseUrl, now = () => new Date(), newId = randomUUID, generateToken,
}: {
  store: BootstrapStore;
  workspaceName: string;
  publicBaseUrl: string | undefined;
  now?: () => Date;
  newId?: () => string;
  generateToken?: () => string;
}): Promise<{ workspaceId: string; link: string; expiresAt: Date }> {
  const origin = publicOrigin(publicBaseUrl);

  return store.transaction(async tx => {
    if ((await tx.countWorkspaces()) > 0) {
      throw new Error('Refusing to bootstrap: a Workspace already exists. Create further Owners from the Invitations screen.');
    }
    const workspaceId = newId();
    await tx.insertWorkspace({ id: workspaceId, name: workspaceName, assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS });
    const { token, expiresAt } = await issueInvitation({ create: tx.createInvitation }, { workspaceId, createdBy: null, role: 'owner', now: now(), generateToken });
    return { workspaceId, link: `${origin}/invite/${token}`, expiresAt };
  });
}

function publicOrigin(value: string | undefined): string {
  const fail = () => new Error('Set BETTER_AUTH_URL to the public address of the app (for example https://app.example.com) so the Invitation link works');
  if (!value) throw fail();
  let url: URL;
  try { url = new URL(value); } catch { throw fail(); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw fail();
  return url.origin;
}
