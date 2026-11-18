export const dynamic = "force-dynamic";
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck, User } from 'lucide-react';
import { authorizeWorkspaceOwner } from '@/lib/authorization';
import { listMembers } from '@/lib/workspaces';
import MemberActions from '@/components/member-actions';

const roleLabel = { owner: 'Owner', member: 'Member' } as const;

export default async function Members({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await authorizeWorkspaceOwner(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();

  const members = await listMembers(access.workspace.id);
  const ownerCount = members.filter(member => member.role === 'owner').length;

  return (
    <main className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl overflow-hidden px-4 py-10 sm:px-8 sm:py-14">
      <section className="relative mx-auto max-w-3xl">
        <Link href={`/w/${access.workspace.id}`} className="-ml-2 inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>Back to {access.workspace.name}</span>
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{access.workspace.name}</p>
        <h1 className="gradient-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Members</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          Everyone with access to this workspace and their role.
        </p>
        <hr className="gradient-divider my-7" />
        <ul className="grid gap-3" aria-label="Workspace members">
          {members.map(member => (
            <li key={member.userId} className="workspace-card flex-wrap">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-foreground">
                {member.role === 'owner' ? <ShieldCheck aria-hidden="true" className="size-5" /> : <User aria-hidden="true" className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium tracking-tight">{member.name}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{member.email}</span>
              </span>
              <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium">{roleLabel[member.role]}</span>
              <MemberActions
                workspaceId={access.workspace.id}
                member={member}
                isSelf={member.userId === access.userId}
                isLastOwner={member.role === 'owner' && ownerCount === 1}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
