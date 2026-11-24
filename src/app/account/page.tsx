import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { auth } from '@/lib/auth';

export default async function AccountPage() {
  if (!auth) redirect('/login');

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const { name, email } = session.user;

  return (
    <main className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Your account</p>
        <h1 className="gradient-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Account</h1>
        <hr className="gradient-divider my-7" />
        <div className="flex items-center gap-4">
          <Avatar name={name} className="size-16 text-xl" />
          <div className="min-w-0">
            <p className="truncate text-lg font-medium">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
