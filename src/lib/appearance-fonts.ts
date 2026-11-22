import { Geist, IBM_Plex_Sans, Inter, Lora } from 'next/font/google';
import type { FontId } from './appearance';

// Self-hosted at build time by next/font: no runtime requests to Google. Each declares the CSS
// variable that FONTS[id].variable in the registry refers to. `system` needs no file.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ibm-plex-sans', display: 'swap' });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });

/** The class that declares a font's CSS variable, or undefined for the system stack. */
export const fontVariableClass: Record<FontId, string | undefined> = {
  system: undefined,
  inter: inter.variable,
  geist: geist.variable,
  'ibm-plex-sans': ibmPlexSans.variable,
  lora: lora.variable,
};
