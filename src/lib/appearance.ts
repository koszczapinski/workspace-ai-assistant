/**
 * The Appearance registry (ADR-0003): the closed preset lists a Workspace can choose from, in one
 * place. The stored values are plain text, so adding or removing a preset needs no migration;
 * `resolveAppearance` falls back to the default for anything it does not know.
 */

export type BackgroundId = 'terra' | 'aurora' | 'nebula' | 'plain';
export type FontId = 'system' | 'inter' | 'geist' | 'ibm-plex-sans' | 'lora';
export type AccentId = 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';

export type Appearance = { background: BackgroundId; font: FontId; accent: AccentId };
/** What the database hands back: any text, possibly a preset that no longer exists. */
export type StoredAppearance = { background?: unknown; font?: unknown; accent?: unknown };

export const DEFAULT_APPEARANCE: Appearance = { background: 'terra', font: 'system', accent: 'sky' };

export const BACKGROUNDS: Record<BackgroundId, { label: string; image: string | null; gradient: string | null }> = {
  terra: { label: 'Terra', image: "url('/terra-background.jpg')", gradient: null },
  aurora: { label: 'Aurora', image: null, gradient: 'linear-gradient(135deg, oklch(70% 0.17 165), oklch(58% 0.13 200))' },
  nebula: { label: 'Nebula', image: null, gradient: 'linear-gradient(135deg, oklch(55% 0.24 295), oklch(68% 0.2 350))' },
  plain: { label: 'Plain', image: null, gradient: null },
};

const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** `variable` is the CSS variable name the matching `next/font/google` instance must declare. */
export const FONTS: Record<FontId, { label: string; variable: string | null; fallback: string }> = {
  system: { label: 'System', variable: null, fallback: SYSTEM_STACK },
  inter: { label: 'Inter', variable: '--font-inter', fallback: SYSTEM_STACK },
  geist: { label: 'Geist', variable: '--font-geist', fallback: SYSTEM_STACK },
  'ibm-plex-sans': { label: 'IBM Plex Sans', variable: '--font-ibm-plex-sans', fallback: SYSTEM_STACK },
  lora: { label: 'Lora', variable: '--font-lora', fallback: 'ui-serif, Georgia, "Times New Roman", serif' },
};

type AccentMode = { primary: string; primaryForeground: string; ring: string };

/**
 * Sky is the default and keeps today's neutral buttons, so a Workspace that never chose looks
 * unchanged; its sky blue appears only as the `swatch`. Every other accent colors the primary.
 */
export const ACCENTS: Record<AccentId, { label: string; swatch: string; light: AccentMode; dark: AccentMode }> = {
  sky: {
    label: 'Sky', swatch: '#38bdf8',
    light: { primary: 'oklch(20.5% 0 0)', primaryForeground: 'oklch(98.5% 0 0)', ring: 'oklch(55.6% 0 0)' },
    dark: { primary: 'oklch(92.2% 0 0)', primaryForeground: 'oklch(20.5% 0 0)', ring: 'oklch(55.6% 0 0)' },
  },
  emerald: {
    label: 'Emerald', swatch: 'oklch(70% 0.15 160)',
    light: { primary: 'oklch(48% 0.12 160)', primaryForeground: 'oklch(98.5% 0 0)', ring: 'oklch(60% 0.14 160)' },
    dark: { primary: 'oklch(78% 0.15 160)', primaryForeground: 'oklch(20% 0.04 160)', ring: 'oklch(70% 0.15 160)' },
  },
  violet: {
    label: 'Violet', swatch: 'oklch(62% 0.2 295)',
    light: { primary: 'oklch(48% 0.2 295)', primaryForeground: 'oklch(98.5% 0 0)', ring: 'oklch(60% 0.2 295)' },
    dark: { primary: 'oklch(78% 0.13 295)', primaryForeground: 'oklch(20% 0.05 295)', ring: 'oklch(68% 0.18 295)' },
  },
  amber: {
    label: 'Amber', swatch: 'oklch(80% 0.16 80)',
    light: { primary: 'oklch(80% 0.16 80)', primaryForeground: 'oklch(22% 0.04 80)', ring: 'oklch(68% 0.16 80)' },
    dark: { primary: 'oklch(82% 0.16 80)', primaryForeground: 'oklch(22% 0.04 80)', ring: 'oklch(75% 0.16 80)' },
  },
  rose: {
    label: 'Rose', swatch: 'oklch(65% 0.2 10)',
    light: { primary: 'oklch(52% 0.2 15)', primaryForeground: 'oklch(98.5% 0 0)', ring: 'oklch(62% 0.2 15)' },
    dark: { primary: 'oklch(78% 0.14 10)', primaryForeground: 'oklch(20% 0.05 10)', ring: 'oklch(70% 0.17 10)' },
  },
};

export const backgroundIds = Object.keys(BACKGROUNDS) as [BackgroundId, ...BackgroundId[]];
export const fontIds = Object.keys(FONTS) as [FontId, ...FontId[]];
export const accentIds = Object.keys(ACCENTS) as [AccentId, ...AccentId[]];

function pick<Id extends string>(table: Record<Id, unknown>, value: unknown, fallback: Id): Id {
  return typeof value === 'string' && Object.hasOwn(table, value) ? (value as Id) : fallback;
}

export type ResolvedAppearance = {
  background: { id: BackgroundId; image: string | null; gradient: string | null };
  font: { id: FontId; variable: string | null };
  accent: { id: AccentId };
  /** CSS custom properties for the Workspace content wrapper; globals.css maps them to the theme tokens. */
  style: Record<string, string>;
};

/** The pure resolver: stored values in, what the Workspace layout applies out. Unknown or missing falls back per dimension. */
export function resolveAppearance(stored: StoredAppearance | null | undefined): ResolvedAppearance {
  const backgroundId = pick(BACKGROUNDS, stored?.background, DEFAULT_APPEARANCE.background);
  const fontId = pick(FONTS, stored?.font, DEFAULT_APPEARANCE.font);
  const accentId = pick(ACCENTS, stored?.accent, DEFAULT_APPEARANCE.accent);
  const font = FONTS[fontId];
  const accent = ACCENTS[accentId];
  return {
    background: { id: backgroundId, image: BACKGROUNDS[backgroundId].image, gradient: BACKGROUNDS[backgroundId].gradient },
    font: { id: fontId, variable: font.variable },
    accent: { id: accentId },
    style: {
      '--app-font-sans': font.variable ? `var(${font.variable}), ${font.fallback}` : font.fallback,
      '--ws-accent': accent.swatch,
      '--ws-primary-light': accent.light.primary,
      '--ws-primary-foreground-light': accent.light.primaryForeground,
      '--ws-ring-light': accent.light.ring,
      '--ws-primary-dark': accent.dark.primary,
      '--ws-primary-foreground-dark': accent.dark.primaryForeground,
      '--ws-ring-dark': accent.dark.ring,
    },
  };
}
