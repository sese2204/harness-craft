import type { PartyMember } from '@harness-craft/sheet';

import { PartySprite } from './pixel';
import styles from './sheet.module.css';
import { COLOR, FONT_PIXEL, sectionLabel } from './theme';

const BOB_STAGGER_S = 0.2;

export function PartyPanel({ members, total }: { members: readonly PartyMember[]; total: number }) {
  return (
    <section aria-label="파티 멤버" className={styles.panel} style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={sectionLabel}>PARTY</div>
        <h2 style={{ fontSize: 17, margin: 0, fontWeight: 400 }}>
          파티 멤버 <span style={{ color: COLOR.dim }}>서브에이전트 {total}</span>
        </h2>
      </div>
      {members.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: COLOR.muted }}>아직 파티원이 없습니다.</p>
      ) : (
        <ul className={styles.partyGrid} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {members.map((p, i) => (
            <li
              key={p.name}
              style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0, background: COLOR.well, border: `3px solid ${COLOR.border}`, boxShadow: `0 0 0 2px ${COLOR.ink}`, padding: 14 }}
            >
              <div style={{ width: 72, height: 80, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: COLOR.ink, border: `2px solid ${COLOR.grid}`, paddingBottom: 6 }}>
                <div style={{ animation: `bob 1.4s steps(2) ${i * BOB_STAGGER_S}s infinite` }}>
                  <PartySprite hair={p.hair} cloth={p.cloth} pants={p.pants} scale={6} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <div style={{ fontSize: 17, color: COLOR.text, overflowWrap: 'anywhere' }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FONT_PIXEL, fontSize: 8, color: COLOR.page, background: p.badge, padding: '4px 6px' }}>{p.role}</span>
                  <span style={{ fontSize: 12, color: COLOR.muted, border: `2px solid ${COLOR.border}`, padding: '2px 6px' }}>{p.cls}</span>
                </div>
                {p.desc && (
                  <div className={styles.clamp2} style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.3 }}>
                    {p.desc}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
