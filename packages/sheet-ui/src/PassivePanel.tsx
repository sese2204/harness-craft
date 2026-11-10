import type { Passive } from '@harness-craft/sheet';

import { PixelIcon } from './pixel';
import styles from './sheet.module.css';
import { COLOR, FONT_PIXEL, sectionLabel } from './theme';

export function PassivePanel({ passives }: { passives: readonly Passive[] }) {
  return (
    <section aria-label="패시브 스킬" className={styles.panel} style={{ gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={sectionLabel}>PASSIVE</div>
        <h2 style={{ fontSize: 16, margin: 0, fontWeight: 400 }}>
          패시브 스킬 <span style={{ color: COLOR.dim }}>hooks</span>
        </h2>
      </div>
      {passives.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: COLOR.muted }}>등록된 훅이 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {passives.map((h) => (
            <li
              key={h.event}
              style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 10, alignItems: 'start', background: COLOR.well, border: `2px solid ${COLOR.border}`, padding: 10 }}
            >
              <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLOR.ink }}>
                <PixelIcon name={h.icon} scale={3} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, color: COLOR.text, overflowWrap: 'anywhere' }}>{h.name}</span>
                  <span style={{ fontFamily: FONT_PIXEL, fontSize: 8, color: COLOR.purple, whiteSpace: 'nowrap' }}>{h.event}</span>
                </div>
                <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.3 }}>{h.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
