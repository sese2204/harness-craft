import { Press_Start_2P } from 'next/font/google';
import localFont from 'next/font/local';

export const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-press-start',
});

// NeoDunggeunmo v1.601, SIL OFL 1.1 — the file and its license live in packages/sheet-ui/fonts (NEODGM-OFL.txt).
export const neodgm = localFont({
  src: '../node_modules/@harness-craft/sheet-ui/fonts/neodgm.woff2',
  display: 'swap',
  variable: '--font-neodgm',
});
