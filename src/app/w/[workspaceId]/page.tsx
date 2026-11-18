export const dynamic = "force-dynamic";
import { redirect, notFound } from 'next/navigation';
import { authorizeWorkspace } from '@/lib/authorization';
import Chat from './chat';

export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await authorizeWorkspace(workspaceId);
  if (access.kind === 'unavailable' || access.kind === 'unauthenticated') redirect('/login');
  if (access.kind === 'forbidden') notFound();
  return <Chat id={access.workspace.id} name={access.workspace.name} isOwner={access.workspace.role === 'owner'} />;
}
