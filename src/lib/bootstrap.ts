import { randomUUID } from 'node:crypto';
import { parseConfirmDatabase } from './environment-guard';
import { issueInvitation, type InvitationStore } from './invitations';
import { workspaceNameSchema } from './workspace-settings';

export const DEFAULT_ASSISTANT_INSTRUCTIONS =
  'You are a helpful assistant for this Workspace. Answer clearly and concisely, and say so when you are not sure.';

/** What the bootstrap needs inside one database transaction. */
export type BootstrapTransaction = {
  /** Locks the Workspace table against concurrent bootstraps, then lists its rows (with whether each has an Owner Membership). */
  lockWorkspaces: () => Promise<{ id: string; name: string; hasOwner: boolean }[]>;
  insertWorkspace: (workspace: { id: string; name: string; assistantInstructions: string }) => Promise<void>;
  /** Revokes the Workspace's still-pending Invitations that bootstrap created (no creating User, role owner); returns how many. */
  revokePendingBootstrapInvitations: (workspaceId: string) => Promise<number>;
  createInvitation: InvitationStore['create'];
};

export type BootstrapStore = {
  /** Runs `fn` atomically: if it throws, nothing it wrote is kept. */
  transaction: <T>(fn: (tx: BootstrapTransaction) => Promise<T>) => Promise<T>;
};

/** Reads the optional `--workspace <name>` (or `--workspace=<name>`) and `--confirm-database`; a given name is validated like Workspace settings. */
export function parseBootstrapArgs(argv: readonly string[]): { workspaceName: string | undefined; confirmDatabase: string | undefined } {
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
  if (raw === undefined) return { workspaceName: undefined, confirmDatabase: parseConfirmDatabase(argv) };

  const parsed = workspaceNameSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid Workspace name.');
  return { workspaceName: parsed.data, confirmDatabase: parseConfirmDatabase(argv) };
}

export type BootstrapResult = {
  /** `created`: a new Workspace and its Owner Invitation. `reissued`: a fresh Owner Invitation for the Workspace that still has no Owner. */
  kind: 'created' | 'reissued';
  workspaceId: string;
  workspaceName: string;
  link: string;
  expiresAt: Date;
};

/**
 * First-run command, all in one transaction under a table lock (concurrent runs queue and see each other's result):
 * - no Workspace: creates it (`workspaceName` required) and issues its Owner Invitation;
 * - exactly one Workspace without an Owner: creates nothing, revokes the earlier pending bootstrap Invitations and issues
 *   a fresh Owner Invitation (`workspaceName`, if given, must equal the existing name);
 * - otherwise (an Owner exists, or several Workspaces): refuses before writing.
 * The link is built from the app's public base URL (BETTER_AUTH_URL) and is returned to the caller only; the database
 * holds just the token hash.
 */
export async function bootstrapWorkspace({
  store, workspaceName, publicBaseUrl, now = () => new Date(), newId = randomUUID, generateToken,
}: {
  store: BootstrapStore;
  workspaceName: string | undefined;
  publicBaseUrl: string | undefined;
  now?: () => Date;
  newId?: () => string;
  generateToken?: () => string;
}): Promise<BootstrapResult> {
  const origin = publicOrigin(publicBaseUrl);

  return store.transaction(async tx => {
    const existing = await tx.lockWorkspaces();
    const issue = async (workspaceId: string) => {
      const { token, expiresAt } = await issueInvitation({ create: tx.createInvitation }, { workspaceId, createdBy: null, role: 'owner', now: now(), generateToken });
      return { link: `${origin}/invite/${token}`, expiresAt };
    };

    if (existing.length === 0) {
      if (workspaceName === undefined) throw new Error('--workspace needs a Workspace name, for example --workspace "Acme"');
      const workspaceId = newId();
      await tx.insertWorkspace({ id: workspaceId, name: workspaceName, assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS });
      return { kind: 'created', workspaceId, workspaceName, ...(await issue(workspaceId)) };
    }
    if (existing.length > 1) {
      throw new Error('Refusing to bootstrap: more than one Workspace exists. Create further Invitations from the members screen of the Workspace.');
    }
    const [workspace] = existing;
    if (workspace.hasOwner) {
      throw new Error('Refusing to bootstrap: the Workspace already has an Owner; create further Invitations from the members screen.');
    }
    if (workspaceName !== undefined && workspaceName !== workspace.name) {
      throw new Error(`Refusing to bootstrap: the existing Workspace is named "${workspace.name}", not "${workspaceName}". Omit --workspace or pass the existing name; nothing was renamed.`);
    }
    await tx.revokePendingBootstrapInvitations(workspace.id);
    return { kind: 'reissued', workspaceId: workspace.id, workspaceName: workspace.name, ...(await issue(workspace.id)) };
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
