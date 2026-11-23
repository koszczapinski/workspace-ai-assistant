import { z } from 'zod';
import { ownerDenied, type OwnerAccess } from './owner-authorization';

export const NAME_MAX = 60;
export const INSTRUCTIONS_MAX = 4000;

export type WorkspaceSettings = { name: string; assistantInstructions: string };

type WorkspaceSettingsDeps = {
  /** Owner-only authorization for one Workspace; derives identity and role from the Session and stored Membership. */
  authorize: (workspaceId: string) => Promise<OwnerAccess>;
  store: {
    updateWorkspaceSettings: (workspaceId: string, settings: WorkspaceSettings) => Promise<WorkspaceSettings>;
  };
};

type Context = { params: Promise<{ workspaceId: string }> };

/** The one Workspace name rule: Workspace settings and the bootstrap script both use it. */
export const workspaceNameSchema = z.string('Name is required.').trim()
  .min(1, 'Name is required.')
  .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters.`);

const settingsSchema = z.object({
  name: workspaceNameSchema,
  assistantInstructions: z.string('Assistant instructions are required.').trim()
    .min(1, 'Assistant instructions are required.')
    .max(INSTRUCTIONS_MAX, `Assistant instructions must be at most ${INSTRUCTIONS_MAX} characters.`),
});

/**
 * Owner-only Workspace settings. The Workspace comes from the address and is confirmed by the Owner
 * check on every request; nothing in the body can name another Workspace or an acting User.
 */
export function createWorkspaceSettingsHandlers({ authorize, store }: WorkspaceSettingsDeps) {
  return {
    async PATCH(request: Request, { params }: Context): Promise<Response> {
      const { workspaceId } = await params;
      const access = await authorize(workspaceId);
      if (access.kind !== 'owner') return ownerDenied(access);

      let raw: unknown;
      try { raw = await request.json(); } catch { return Response.json({ error: 'Malformed JSON' }, { status: 400 }); }
      const parsed = settingsSchema.safeParse(raw);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings.' }, { status: 400 });

      return Response.json(await store.updateWorkspaceSettings(access.workspace.id, parsed.data));
    },
  };
}
