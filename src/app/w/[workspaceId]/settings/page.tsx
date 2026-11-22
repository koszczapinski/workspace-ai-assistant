export const dynamic = "force-dynamic";
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { authorizeWorkspaceOwner } from '@/lib/authorization';
import { workspaceSettings } from '@/lib/workspaces';
import { SettingsForm } from './settings-form';

/** Workspace settings, guarded like the members screen: anonymous goes to login, non-Owners get not-found. */
export default async function Settings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await authorizeWorkspaceOwner(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();

  const settings = await workspaceSettings(access.workspace.id);
  if (!settings) notFound();

  return (
    <main className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl overflow-hidden px-4 py-10 sm:px-8 sm:py-14">
      <section className="relative mx-auto max-w-3xl">
        <Link href={`/w/${access.workspace.id}`} className="-ml-2 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>Back to {settings.name}</span>
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{settings.name}</p>
        <h1 className="gradient-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Workspace settings</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          The name and Assistant instructions of this workspace. Changes apply to the next chat request.
        </p>
        <hr className="gradient-divider my-7" />
        <SettingsForm workspaceId={access.workspace.id} initial={settings} />
      </section>
    </main>
  );
}
