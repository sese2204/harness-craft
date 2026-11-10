import type { Stat } from '@harness-craft/sheet';

import styles from './sheet.module.css';
import { COLOR, FONT_PIXEL, sectionLabel } from './theme';

const CX = 150;
const CY = 135;
const R = 92;
const RINGS = [0.25, 0.5, 0.75, 1];
const LABEL_RADIUS = 1.08;

const ang = (i: number, n: number) => ((-90 + (360 / n) * i) * Math.PI) / 180;
const pt = (i: number, n: number, f: number): [number, number] => [CX + Math.cos(ang(i, n)) * R * f, CY + Math.sin(ang(i, n)) * R * f];
const polygon = (n: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => pt(i, n, f(i)).map(Math.round).join(',')).join(' ');

/** Label anchor per axis, same rules as the design (left/right/center by cosine, above/below by sine). */
function labelPlacement(i: number, n: number) {
  const [lx, ly] = pt(i, n, LABEL_RADIUS);
  const c = Math.cos(ang(i, n));
  const s = Math.sin(ang(i, n));
  const align = c > 0.3 ? 'flex-start' : c < -0.3 ? 'flex-end' : 'center';
  const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%';
  const ty = s < -0.3 ? '-100%' : s > 0.3 ? '0' : '-50%';
  return { left: `${(lx / 3).toFixed(2)}%`, top: `${(ly / 2.7).toFixed(2)}%`, transform: `translate(${tx},${ty})`, align };
}

export function StatsPanel({ stats, total }: { stats: readonly Stat[]; total: number }) {
  const n = stats.length;
  return (
    <section aria-label="스탯" className={styles.panel} style={{ gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ ...sectionLabel, margin: 0, fontWeight: 400 }}>STATS</h2>
        <div style={{ fontSize: 13, color: COLOR.dim }}>
          총합 <span style={{ color: COLOR.gold }}>{total}</span>
        </div>
      </div>
      <div className={styles.radar} style={{ position: 'relative', aspectRatio: '300/270' }}>
        <svg aria-hidden="true" viewBox="0 0 300 270" width="100%" height="100%" style={{ display: 'block', shapeRendering: 'crispEdges' }}>
          {RINGS.map((f) => (
            <polygon key={f} points={polygon(n, () => f)} fill="none" stroke={COLOR.border} strokeWidth="2" />
          ))}
          {stats.map((s, i) => {
            const [x, y] = pt(i, n, 1).map(Math.round);
            return <line key={s.key} x1={CX} y1={CY} x2={x} y2={y} stroke={COLOR.grid} strokeWidth="2" />;
          })}
          <polygon points={polygon(n, (i) => (stats[i]?.value ?? 0) / 100)} fill="rgba(111,227,111,.28)" stroke={COLOR.green} strokeWidth="3" />
          {stats.map((s, i) => {
            const [x, y] = pt(i, n, s.value / 100).map(Math.round);
            return <rect key={s.key} x={(x ?? 0) - 4} y={(y ?? 0) - 4} width="8" height="8" fill={COLOR.green} stroke={COLOR.ink} strokeWidth="2" />;
          })}
        </svg>
        <dl style={{ margin: 0 }}>
          {stats.map((s, i) => {
            const p = labelPlacement(i, n);
            return (
              <div
                key={s.key}
                style={{
                  position: 'absolute', left: p.left, top: p.top, transform: p.transform, display: 'flex', flexDirection: 'column',
                  alignItems: p.align, gap: 2, whiteSpace: 'nowrap',
                }}
              >
                <dt style={{ fontSize: 13, color: COLOR.soft }}>{s.name}</dt>
                <dd style={{ margin: 0, fontFamily: FONT_PIXEL, fontSize: 10, color: COLOR.gold }}>{s.value}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
