import { redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { avatarSrc } from '@/lib/avatar-url';
import { avatarStore } from '@/lib/avatar-store';
import { currentSession } from '@/lib/session';
import { AvatarForm } from './avatar-form';

export default async function AccountPage() {
  const session = await currentSession();
  if (!session) redirect('/login');

  const { id, name, email } = session.user;
  const avatarVersion = await avatarStore.version(id);

  return (
    <main className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Your account</p>
        <h1 className="gradient-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Account</h1>
        <hr className="gradient-divider my-7" />
        <div className="flex items-center gap-4">
          <Avatar name={name} src={avatarSrc(id, avatarVersion)} className="size-16 text-xl" />
          <div className="min-w-0">
            <p className="truncate text-lg font-medium">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <AvatarForm hasAvatar={avatarVersion !== null} />
      </section>
    </main>
  );
}
