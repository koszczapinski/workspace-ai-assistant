'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const shell = 'mx-auto grid min-h-[calc(100dvh-4rem)] max-w-md items-center px-4 py-10 sm:px-8';
const card = 'rounded-2xl border border-white/10 bg-card/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8 dark:bg-card/45';
const fieldClass = 'h-11 rounded-xl border-white/10 bg-background/50 px-3 backdrop-blur-md focus:bg-background/80';

export function InvalidLink() {
  return (
    <main className={shell}>
      <section className={card} aria-labelledby="invalid-title">
        <h1 id="invalid-title" className="text-2xl font-semibold tracking-tight">This link is not valid</h1>
        <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">
          This invitation link is not valid. Ask for a new invitation.
        </p>
      </section>
    </main>
  );
}

type Fields = Partial<Record<'name' | 'email' | 'password', string>>;

export function AcceptForm({ token, workspaceName }: { token: string; workspaceName: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setFields({});
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name: String(form.get('name')), email: String(form.get('email')), password: String(form.get('password')) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 201) {
        if (body.signedIn) router.push(`/w/${body.workspaceId}`);
        else setNeedsSignIn(true);
        return;
      }
      if (body.fields) setFields(body.fields);
      setError(body.error ?? 'Something went wrong. Try again.');
      if (body.code === 'invalid-link') router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  const field = (name: keyof Fields, label: string, type: string, autoComplete: string) => (
    <label className="block space-y-2 text-sm font-medium" htmlFor={name}>
      {label}
      <Input
        id={name} name={name} type={type} required autoComplete={autoComplete} className={fieldClass}
        aria-invalid={fields[name] ? true : undefined} aria-describedby={fields[name] ? `${name}-error` : undefined}
      />
      {fields[name] && <span id={`${name}-error`} className="block text-sm font-normal text-destructive">{fields[name]}</span>}
    </label>
  );

  if (needsSignIn) {
    return (
      <main className={shell}>
        <section className={card} aria-labelledby="created-title">
          <h1 id="created-title" className="text-2xl font-semibold tracking-tight">Account created</h1>
          <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">
            Your account was created. We could not sign you in automatically, so sign in to join {workspaceName}.
          </p>
          <Link href="/login" className={buttonVariants({ className: 'mt-6 h-11 w-full rounded-full' })}>Go to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={shell}>
      <section className={card} aria-labelledby="accept-title">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">You are invited</p>
        <h1 id="accept-title" className="mt-2 text-2xl font-semibold tracking-tight">Join {workspaceName}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Create your account to join as a Member.</p>
        <hr className="gradient-divider my-6" />
        <form className="space-y-5" onSubmit={submit} noValidate>
          {field('name', 'Name', 'text', 'name')}
          {field('email', 'Email', 'email', 'username')}
          {field('password', 'Password', 'password', 'new-password')}
          <div role="alert">
            {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" disabled={pending} className="h-11 w-full rounded-full">
            {pending ? 'Creating account…' : 'Create account and join'}
          </Button>
        </form>
      </section>
    </main>
  );
}
