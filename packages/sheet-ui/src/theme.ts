// Design tokens copied from the Character Sheet design (Claude Design export).
import type { CSSProperties } from 'react';
import type { Rarity } from '@harness-craft/sheet';

export const COLOR = {
  page: '#110e1b',
  panel: '#1c1830',
  well: '#120f1c',
  wellHover: '#1a1529',
  ink: '#0b0914',
  border: '#3a3557',
  grid: '#2a2440',
  text: '#f3eee2',
  soft: '#c9c2e6',
  muted: '#8f88ad',
  /** Design used #6a6488 (3.10:1 on #1c1830). Nearest same-hue color that reaches 4.5:1 there. */
  dim: '#8680a2',
  gold: '#ffc23d',
  goldLight: '#ffd36b',
  goldDark: '#a86f00',
  green: '#6fe36f',
  purple: '#b05cff',
  pink: '#ff6b9d',
  sparkle: '#fff3c4',
} as const;

export const RARITY: Readonly<Record<Rarity, { label: string; color: string }>> = {
  common: { label: '커먼', color: '#9aa3ad' },
  rare: { label: '레어', color: '#3b9cff' },
  epic: { label: '에픽', color: '#b05cff' },
  legendary: { label: '레전더리', color: '#ffc23d' },
};

export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const FONT_PIXEL = "var(--font-press-start), 'Press Start 2P', monospace";

export const sectionLabel: CSSProperties = { fontFamily: FONT_PIXEL, fontSize: 11, color: COLOR.muted };

const numberFormat = new Intl.NumberFormat('en-US');

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatUses(value: number): string {
  return `${formatNumber(value)}회`;
}
