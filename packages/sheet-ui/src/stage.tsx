// Backdrop of the character stage, picked by subscription plan (docs/sheet-mapping.md 「구독 무대」).
// Drawn in the 322×394 stage interior with the floor line at y=322. Kept dark and low-contrast so the hero, the slot
// boxes and their labels stay readable; nothing bright sits behind the six slot columns (x 6–70 and 252–316).
import type { ReactNode } from 'react';
import type { StageKind } from '@harness-craft/sheet';

import styles from './sheet.module.css';

const W = 322;
const H = 394;
const FLOOR = 322;

type R = readonly [x: number, y: number, w: number, h: number];

function rects(list: readonly R[], fill: string): ReactNode {
  return list.map(([x, y, w, h]) => <rect key={`${fill}${x},${y},${w},${h}`} x={x} y={y} width={w} height={h} fill={fill} />);
}

/** Free: night field with hills, stars and a moon. */
function Field() {
  const stars: R[] = [[84, 14, 2, 2], [120, 40, 2, 2], [150, 12, 2, 2], [176, 46, 2, 2], [84, 128, 2, 2], [238, 120, 2, 2], [98, 64, 2, 2], [236, 84, 2, 2]];
  const tufts: R[] = [[90, 336, 4, 4], [94, 332, 2, 4], [150, 360, 4, 4], [154, 356, 2, 4], [208, 340, 4, 4], [212, 336, 2, 4], [120, 380, 4, 4]];
  return (
    <>
      {rects(stars, '#6a6490')}
      {rects([[206, 14, 14, 18], [202, 18, 4, 10], [220, 18, 4, 10]], '#5a5480')}
      {rects([[0, 286, 70, 36], [70, 270, 60, 52], [130, 280, 50, 42], [180, 262, 70, 60], [250, 284, 72, 38]], '#16261b')}
      {rects([[0, 302, 110, 20], [110, 296, 80, 26], [190, 304, 132, 18]], '#1c3322')}
      {rects([[0, FLOOR, W, H - FLOOR]], '#172a1c')}
      {rects(tufts, '#24402a')}
    </>
  );
}

/** Pro / Plus / Go: castle wall with two towers flanking the hero, a gate behind it and torches on the towers. */
function Gate() {
  const wall = '#221d36';
  const mortar = '#302a48';
  const rows = Array.from({ length: 12 }, (_, i) => 154 + i * 14);
  const merlons: R[] = Array.from({ length: 12 }, (_, i) => [i * 28, 138, 16, 16] as const);
  const towerMerlons: R[] = [[72, 92, 8, 10], [86, 92, 8, 10], [100, 92, 4, 10], [218, 92, 4, 10], [228, 92, 8, 10], [242, 92, 8, 10]];
  const bars: R[] = Array.from({ length: 11 }, (_, i) => [97 + i * 12, 190, 2, FLOOR - 190] as const);
  return (
    <>
      {rects([[0, 154, W, FLOOR - 154], ...merlons], wall)}
      {rows.map((y, i) => (
        <g key={y}>
          <rect x={0} y={y} width={W} height={2} fill={mortar} />
          {Array.from({ length: 12 }, (_, j) => (
            <rect key={j} x={(i % 2) * 14 + j * 28} y={y + 2} width={2} height={12} fill={mortar} />
          ))}
        </g>
      ))}
      {rects([[72, 102, 32, FLOOR - 102], [218, 102, 32, FLOOR - 102], ...towerMerlons], '#2a2442')}
      {rects([[72, 102, 32, 2], [218, 102, 32, 2], [104, 102, 2, FLOOR - 102], [216, 102, 2, FLOOR - 102]], '#3a3358')}
      {rects([[84, 120, 8, 14], [230, 120, 8, 14]], '#0c0a14')}
      {rects([[89, 200, 144, FLOOR - 200], [97, 188, 128, 12], [113, 178, 96, 10], [137, 170, 48, 8]], '#0c0a14')}
      {rects(bars, '#29233d')}
      {rects([[84, 214, 6, 18], [232, 214, 6, 18]], '#5a3a20')}
      <g className={styles.fxFlame}>
        {rects([[82, 198, 10, 16], [230, 198, 10, 16]], '#d8641e')}
        {rects([[84, 202, 6, 10], [232, 202, 6, 10]], '#ffc23d')}
      </g>
      {rects([[0, FLOOR, W, H - FLOOR]], '#1b1824')}
      {rects([[0, 352, W, 2], [60, FLOOR, 2, 30], [160, FLOOR, 2, 30], [260, FLOOR, 2, 30], [110, 354, 2, 40], [210, 354, 2, 40]], '#26213a')}
    </>
  );
}

/** Team / Business / Enterprise / Edu: timber guild hall with two guild banners. */
function Guild() {
  const planks: R[] = Array.from({ length: 18 }, (_, i) => [i * 18 + 8, 0, 2, FLOOR] as const);
  const banner = (x: number) => (
    <g key={x}>
      {rects([[x - 2, 128, 28, 4]], '#5a3a20')}
      {rects([[x, 132, 24, 72], [x, 204, 8, 8], [x + 16, 204, 8, 8]], '#24407a')}
      {rects([[x + 8, 148, 8, 4], [x + 6, 152, 12, 10], [x + 8, 162, 8, 4], [x + 10, 166, 4, 4]], '#a86f00')}
      {rects([[x, 132, 2, 72], [x + 22, 132, 2, 72]], '#1c3260')}
    </g>
  );
  return (
    <>
      {rects([[0, 0, W, FLOOR]], '#1a1510')}
      {rects(planks, '#221b14')}
      {rects([[0, 116, W, 12]], '#2c2217')}
      {rects([[0, 116, W, 2]], '#3a2c1c')}
      {banner(80)}
      {banner(218)}
      {rects([[0, FLOOR, W, H - FLOOR]], '#1e1710')}
      {rects([[0, 340, W, 2], [0, 360, W, 2], [0, 380, W, 2]], '#2a2016')}
    </>
  );
}

/** Max / ChatGPT Pro: throne room — pillars, a throne behind the hero and a red carpet. */
function Throne() {
  const gold = '#a8781a';
  return (
    <>
      {rects([[0, 0, W, FLOOR]], '#170d18')}
      {rects([[76, 40, 18, FLOOR - 40], [228, 40, 18, FLOOR - 40]], '#24182c')}
      {rects([[72, 34, 26, 8], [224, 34, 26, 8], [72, FLOOR - 8, 26, 8], [224, FLOOR - 8, 26, 8]], '#3a2a40')}
      {rects([[121, 70, 80, 10], [113, 80, 96, 8], [137, 60, 48, 10], [157, 50, 8, 10]], gold)}
      {rects([[105, 88, 112, 170], [93, 228, 136, 30]], gold)}
      {rects([[111, 94, 100, 160], [99, 234, 124, 20]], '#4a0f20')}
      {rects([[87, 258, 148, 64]], '#3a2410')}
      {rects([[87, 258, 148, 4]], gold)}
      {rects([[0, FLOOR, W, H - FLOOR]], '#140b12')}
      {rects([[121, FLOOR, 80, 24], [113, FLOOR + 24, 96, 24], [105, FLOOR + 48, 112, 24]], '#5c1424')}
      {rects([[119, FLOOR, 2, 24], [201, FLOOR, 2, 24], [111, FLOOR + 24, 2, 24], [209, FLOOR + 24, 2, 24], [103, FLOOR + 48, 2, 24], [217, FLOOR + 48, 2, 24]], gold)}
    </>
  );
}

const SCENES: Readonly<Record<StageKind, () => ReactNode>> = { field: Field, gate: Gate, guild: Guild, throne: Throne };

export function StageBackdrop({ kind }: { kind: StageKind }) {
  const Scene = SCENES[kind];
  return (
    <svg
      aria-hidden="true"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: 'absolute', inset: 0, shapeRendering: 'crispEdges', pointerEvents: 'none' }}
    >
      <Scene />
    </svg>
  );
}
