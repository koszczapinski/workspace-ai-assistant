import { resolveAppearance } from '@/lib/appearance';
import { fontVariableClass } from '@/lib/appearance-fonts';
import { authorizeWorkspace } from '@/lib/authorization';
import { getAppearance } from '@/lib/workspaces';

/**
 * Applies the Workspace's Appearance to everything under /w/[workspaceId], during server rendering.
 * It covers the global background and scopes the font and accent to the content below the global
 * header, which keeps the brand look. Only a Member sees a Workspace's Appearance: for anyone else
 * the default shows, and the page itself redirects to login or answers not-found.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await authorizeWorkspace(workspaceId);
  const stored = access.kind === 'authorized' ? await getAppearance(access.workspace.id) : null;
  const appearance = resolveAppearance(stored);
  const { image, gradient } = appearance.background;

  return (
    <div
      className={['workspace-appearance', fontVariableClass[appearance.font.id]].filter(Boolean).join(' ')}
      data-background={appearance.background.id}
      data-font={appearance.font.id}
      data-accent={appearance.accent.id}
      style={appearance.style}
    >
      {/* Covers the root layout's Terra background; sits under the header and the content. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden bg-background">
        {(image || gradient) && (
          <div
            className="absolute inset-0 bg-cover bg-bottom bg-no-repeat opacity-20 transition-opacity duration-500 dark:opacity-40"
            style={{ backgroundImage: image ?? gradient ?? undefined }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/90" />
      </div>
      {children}
    </div>
  );
}
