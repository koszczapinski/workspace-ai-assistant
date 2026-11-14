import { type SVGProps } from 'react';

interface BrandLogoProps extends SVGProps<SVGSVGElement> {
  variant?: 'horizon' | 'crescent' | 'orbit' | 'minimal';
}

export function BrandLogo({ className = 'size-5', variant = 'horizon', ...props }: BrandLogoProps) {
  if (variant === 'crescent') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <path
          d="M 16 4 A 12 12 0 0 1 28 16 A 12 12 0 0 1 16 28 C 22.5 21.5, 22.5 10.5, 16 4 Z"
          fill="#38bdf8"
        />
      </svg>
    );
  }

  if (variant === 'orbit') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <circle cx="16" cy="16" r="7" fill="currentColor" />
        <ellipse
          cx="16"
          cy="16"
          rx="13.5"
          ry="5"
          stroke="#38bdf8"
          strokeWidth="1.5"
          transform="rotate(-23.5 16 16)"
          strokeDasharray="64 12"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (variant === 'minimal') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.75" />
        <path d="M 7 13 A 11 11 0 0 1 25 13" stroke="#38bdf8" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
    );
  }

  // Default: Horizon (Terra Earth Horizon matching background wallpaper)
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="16" cy="16" r="13.5" stroke="#38bdf8" strokeOpacity="0.25" strokeWidth="1" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 5.5 19 C 10 13, 22 13, 26.5 19" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="9" r="1.5" fill="#38bdf8" />
    </svg>
  );
}
