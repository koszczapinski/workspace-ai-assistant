import { describe, expect, it } from 'vitest';
import {
  ACCENTS, BACKGROUNDS, DEFAULT_APPEARANCE, FONTS, accentIds, backgroundIds, fontIds, resolveAppearance,
} from '../src/lib/appearance';

/** OKLCH → linear sRGB → WCAG relative luminance (Björn Ottosson's matrices). */
function luminance(oklch: string): number {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(oklch);
  if (!match) throw new Error(`Unparseable color: ${oklch}`);
  const L = Number(match[1]) / (match[2] ? 100 : 1);
  const C = Number(match[3]);
  const h = (Number(match[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(channel => Math.min(1, Math.max(0, channel)));
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('appearance registry', () => {
  it('lists the closed presets with their defaults first', () => {
    expect(backgroundIds).toEqual(['terra', 'aurora', 'nebula', 'plain']);
    expect(fontIds).toEqual(['system', 'inter', 'geist', 'ibm-plex-sans', 'lora']);
    expect(accentIds).toEqual(['sky', 'emerald', 'violet', 'amber', 'rose']);
    expect(DEFAULT_APPEARANCE).toEqual({ background: 'terra', font: 'system', accent: 'sky' });
  });

  it('resolves the default appearance from missing values', () => {
    const resolved = resolveAppearance({});
    expect(resolved.background.id).toBe('terra');
    expect(resolved.font.id).toBe('system');
    expect(resolved.accent.id).toBe('sky');
  });

  it('falls back per dimension for unknown values and keeps the valid ones', () => {
    const resolved = resolveAppearance({ background: 'sunset', font: 'lora', accent: 42 as unknown as string });
    expect(resolved.background.id).toBe('terra');
    expect(resolved.font.id).toBe('lora');
    expect(resolved.accent.id).toBe('sky');
    expect(resolveAppearance(null).font.id).toBe('system');
    expect(resolveAppearance({ background: 'constructor' }).background.id).toBe('terra');
  });

  it('resolves every preset to a complete set of variables', () => {
    for (const background of backgroundIds) {
      const resolved = resolveAppearance({ background });
      expect(resolved.background.id).toBe(background);
      expect(BACKGROUNDS[background].label).not.toBe('');
    }
    for (const font of fontIds) {
      const { style } = resolveAppearance({ font });
      expect(style['--app-font-sans']).toMatch(/\S/);
      expect(FONTS[font].label).not.toBe('');
    }
    for (const accent of accentIds) {
      const { style } = resolveAppearance({ accent });
      for (const name of [
        '--ws-primary-light', '--ws-primary-foreground-light', '--ws-ring-light',
        '--ws-primary-dark', '--ws-primary-foreground-dark', '--ws-ring-dark', '--ws-accent',
      ]) expect(style[name], `${accent} ${name}`).toMatch(/\S/);
    }
  });

  it('keeps the default accent identical to the current neutral theme', () => {
    expect(ACCENTS.sky.light.primary).toBe('oklch(20.5% 0 0)');
    expect(ACCENTS.sky.dark.primary).toBe('oklch(92.2% 0 0)');
  });

  it.each(accentIds)('%s primary/primary-foreground meets WCAG AA in light and dark', accent => {
    for (const mode of ['light', 'dark'] as const) {
      const { primary, primaryForeground } = ACCENTS[accent][mode];
      expect(contrast(primary, primaryForeground), `${accent} ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
