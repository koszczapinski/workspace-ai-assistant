'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';

export default function UserMenu({ name, email, avatarSrc = null }: { name: string; email: string; avatarSrc?: string | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar name={name} src={avatarSrc} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-muted-foreground">{email}</p>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-lg px-2 py-1.5 hover:bg-muted"
          >
            Account
          </Link>
        </div>
      )}
    </div>
  );
}
