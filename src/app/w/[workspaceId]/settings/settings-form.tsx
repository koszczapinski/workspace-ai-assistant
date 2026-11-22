'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INSTRUCTIONS_MAX } from '@/lib/workspace-settings';

type Props = { workspaceId: string; initial: { name: string; assistantInstructions: string } };

/** Edits name and Assistant instructions and saves both at once. The server validates and re-checks the Owner role. */
export function SettingsForm({ workspaceId, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [instructions, setInstructions] = useState(initial.assistantInstructions);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, assistantInstructions: instructions }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? 'Something went wrong. Try again.');
        return;
      }
      const saved = await response.json() as { name: string; assistantInstructions: string };
      setName(saved.name);
      setInstructions(saved.assistantInstructions);
      setStatus('Settings saved.');
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="workspace-name" className="text-sm font-medium">Name</label>
        <Input id="workspace-name" value={name} onChange={event => setName(event.target.value)} disabled={pending} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <label htmlFor="workspace-instructions" className="text-sm font-medium">Assistant instructions</label>
        <textarea
          id="workspace-instructions"
          value={instructions}
          onChange={event => setInstructions(event.target.value)}
          disabled={pending}
          rows={10}
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30"
        />
        <p className="text-right text-xs text-muted-foreground">{instructions.length} / {INSTRUCTIONS_MAX}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>Save settings</Button>
        {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
