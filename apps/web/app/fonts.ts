import { Press_Start_2P } from 'next/font/google';
import localFont from 'next/font/local';

export const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-press-start',
});

// NeoDunggeunmo v1.601, SIL OFL 1.1 — see public/fonts/NEODGM-OFL.txt
export const neodgm = localFont({
  src: '../public/fonts/neodgm.woff2',
  display: 'swap',
  variable: '--font-neodgm',
});
