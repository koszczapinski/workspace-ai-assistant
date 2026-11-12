import Link from 'next/link';
import { ArrowUpRight, Building2 } from 'lucide-react';

type WorkspaceSummary = { id: string; name: string };

export default function WorkspaceList({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  if (workspaces.length === 0) {
    return (
      <section className="empty-state" aria-labelledby="empty-workspaces-title">
        <div className="empty-state-icon"><Building2 aria-hidden="true" /></div>
        <h2 id="empty-workspaces-title" className="text-lg font-semibold tracking-tight">No workspaces yet</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          No workspaces are available for this account yet.
        </p>
      </section>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {workspaces.map(workspace => (
        <li key={workspace.id}>
          <Link
            className="workspace-card group"
            href={`/w/${workspace.id}`}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-foreground">
              <Building2 aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium tracking-tight">{workspace.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">Private workspace</span>
            </span>
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
