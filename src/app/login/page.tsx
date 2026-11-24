'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const client = createAuthClient();

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');

  return (
    <main className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-10 overflow-hidden px-4 py-10 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-16">
      <section className="relative max-w-xl">
        <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-card/60 px-3.5 py-1.5 text-xs font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur-md">
          <span className="relative flex size-2 items-center justify-center" aria-hidden="true">
            <span className="pulse-star absolute inline-flex size-full rounded-full bg-sky-400" />
            <span className="relative inline-flex size-1.5 rounded-full bg-white" />
          </span>
          Private workspace assistant
        </p>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">A calmer way to think</p>
        <h1 className="gradient-heading max-w-[14ch] text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          Human clarity. AI speed.
        </h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Your team’s knowledge, shaped into focused conversations for the work ahead.
        </p>
        <hr className="gradient-divider mt-8 max-w-sm" />
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-4" />
          Workspace access stays private to your account.
        </p>
      </section>

      <section className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end" aria-labelledby="sign-in-title">
        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8 dark:border-white/10 dark:bg-card/45">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Welcome back</p>
          <h2 id="sign-in-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to continue</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your workspace account to pick up where you left off.</p>
          <hr className="gradient-divider my-6" />
          <form
            className="space-y-5"
            onSubmit={async event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const result = await client.signIn.email({
                email: String(form.get('email')),
                password: String(form.get('password')),
              });

              if (result.error) setError('Sign-in failed. Check your email and password.');
              else {
                router.push('/');
                router.refresh();
              }
            }}
          >
            <label className="block space-y-2 text-sm font-medium" htmlFor="email">
              Email
              <Input id="email" required name="email" type="email" autoComplete="username" className="h-11 rounded-xl border-white/10 bg-background/50 px-3 backdrop-blur-md focus:bg-background/80" />
            </label>
            <label className="block space-y-2 text-sm font-medium" htmlFor="password">
              Password
              <Input id="password" required name="password" type="password" autoComplete="current-password" className="h-11 rounded-xl border-white/10 bg-background/50 px-3 backdrop-blur-md focus:bg-background/80" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full rounded-full shadow-lg shadow-primary/10 transition-all hover:shadow-primary/20">
              Sign in <ArrowUpRight aria-hidden="true" className="ml-1 size-4" />
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">Private demo access · no public registration</p>
        </div>
      </section>
    </main>
  );
}
