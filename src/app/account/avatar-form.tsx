'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Upload, replace or remove the signed-in User's Avatar; the server re-encodes it and the page refreshes. */
export function AvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/avatar', init);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'The Avatar could not be saved. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('The Avatar could not be saved. Try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex">
          <span className="sr-only">Upload a picture</span>
          <input
            ref={input}
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            aria-label="Upload a picture"
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set('file', file);
              void send({ method: 'PUT', body: form });
            }}
          />
        </label>
        {hasAvatar && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void send({ method: 'DELETE' })}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. It is cropped to a square.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
