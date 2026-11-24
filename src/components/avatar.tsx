import { User } from 'lucide-react';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

/** A User's Avatar: their initials (or a generic icon for an empty name) on a neutral brand-token background. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = initialsOf(name);
  return (
    <span
      data-testid="avatar"
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full border border-border/80 bg-muted text-xs font-semibold text-foreground',
        className,
      )}
    >
      {initials || <User className="size-4" />}
    </span>
  );
}
