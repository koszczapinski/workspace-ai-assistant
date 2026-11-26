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
 * Deployer's create-or-re-issue command, all in one transaction under a table lock (concurrent runs queue and see each
 * other's result). Names match after trimming, ignoring case.
 * - with a name and no match: creates that Workspace and issues its Owner Invitation;
 * - with a name and one match without an Owner: revokes that Workspace's pending bootstrap Invitations and issues a fresh one;
 * - with a name and one match with an Owner, or two or more matches: refuses before writing;
 * - without a name: re-issues when exactly one Workspace has no Owner, otherwise refuses and asks for a name.
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

    const reissue = async (workspace: { id: string; name: string }): Promise<BootstrapResult> => {
      await tx.revokePendingBootstrapInvitations(workspace.id);
      return { kind: 'reissued', workspaceId: workspace.id, workspaceName: workspace.name, ...(await issue(workspace.id)) };
    };

    if (workspaceName === undefined) {
      const ownerless = existing.filter(w => !w.hasOwner);
      if (ownerless.length === 1) return reissue(ownerless[0]);
      throw new Error(`Refusing to bootstrap: ${ownerless.length === 0 ? 'no Workspace is waiting for an Owner' : 'several Workspaces have no Owner'}. Pass --workspace "<name>" to create a Workspace or re-issue one by name.`);
    }

    const wanted = normalizeName(workspaceName);
    const matches = existing.filter(w => normalizeName(w.name) === wanted);
    if (matches.length > 1) {
      throw new Error(`Refusing to bootstrap: two Workspaces are named "${workspaceName}" (ignoring case and surrounding spaces). Nothing was written.`);
    }
    if (matches.length === 1) {
      const [match] = matches;
      if (match.hasOwner) {
        throw new Error(`Refusing to bootstrap: Workspace "${match.name}" already has an Owner; create further Invitations from its members screen. Nothing was written.`);
      }
      return reissue(match);
    }
    const workspaceId = newId();
    await tx.insertWorkspace({ id: workspaceId, name: workspaceName, assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS });
    return { kind: 'created', workspaceId, workspaceName, ...(await issue(workspaceId)) };
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
