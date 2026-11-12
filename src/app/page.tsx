import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import WorkspaceList from '@/components/workspace-list';
import { auth } from '@/lib/auth';
import { listWorkspaces } from '@/lib/workspaces';

export default async function Home() {
  if (!auth) redirect('/login');

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const workspaces = await listWorkspaces(session.user.id);

  return (
    <main className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl overflow-hidden px-4 py-10 sm:px-8 sm:py-14">
      <div aria-hidden="true" className="ambient-glow pointer-events-none absolute -right-32 -top-28 size-96 rounded-full opacity-60" />
      <section className="relative mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Your private space</p>
        <h1 className="gradient-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your workspaces</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          Choose a workspace to start a focused conversation with its assistant.
        </p>
        <hr className="gradient-divider my-7" />
        <WorkspaceList workspaces={workspaces} />
      </section>
    </main>
  );
}
