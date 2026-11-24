import { User } from 'lucide-react';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

/**
 * A User's Avatar: their uploaded picture when `src` is given, otherwise their initials (or a generic icon for an empty
 * name) on a neutral brand-token background.
 */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = initialsOf(name);
  return (
    <span
      data-testid="avatar"
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border/80 bg-muted text-xs font-semibold text-foreground',
        className,
      )}
    >
      {src
        // A plain <img>: next/image would cache this private picture in the server's optimizer, outside the access check.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="size-full object-cover" />
        : initials || <User className="size-4" />}
    </span>
  );
}
