import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@harness-craft/sheet-ui/base.css';

import { neodgm, pressStart } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'DEV.QUEST — 캐릭터 시트',
  description: 'Claude Code·Codex 하네스(MCP·스킬·훅·서브에이전트)를 RPG 캐릭터 시트로.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#110e1b',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${pressStart.variable} ${neodgm.variable}`}>
      <body>{children}</body>
    </html>
  );
}
