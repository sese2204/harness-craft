'use client';

import { useEffect, useId, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { SkillCard as SkillCardModel } from '@harness-craft/sheet';

import { PixelIcon } from './pixel';
import styles from './sheet.module.css';
import { COLOR, FONT_PIXEL, RARITY, RARITY_ORDER, formatUses, sectionLabel } from './theme';

const TIP_WIDTH = 300;
const TIP_GAP = 14;
const TIP_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;

interface Tip {
  index: number;
  x: number;
  y: number;
}

/** Same placement as the design (right of the card, flipped left near the edge), clamped for small screens. */
function placeTip(rect: DOMRect): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(TIP_WIDTH, vw - VIEWPORT_MARGIN * 2);
  const right = rect.right + TIP_GAP;
  const left = rect.left - width - TIP_GAP;
  let x: number;
  let y = rect.top;
  if (right + width + 10 <= vw) x = right;
  else if (left >= VIEWPORT_MARGIN) x = left;
  else {
    // No room beside the card (narrow screens): drop below it instead.
    x = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), vw - width - VIEWPORT_MARGIN);
    y = rect.bottom + TIP_GAP;
  }
  if (y + TIP_MAX_HEIGHT > vh) y = Math.max(VIEWPORT_MARGIN, vh - TIP_MAX_HEIGHT - 10);
  return { x, y };
}

function Sparkles() {
  const base: CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  return (
    <span aria-hidden="true">
      <span style={{ ...base, top: 2, left: '50%', color: COLOR.sparkle, fontSize: 14, animation: 'twinkle 1.4s steps(4) infinite' }}>✦</span>
      <span style={{ ...base, bottom: 22, left: 8, color: COLOR.gold, fontSize: 10, animation: 'twinkle 1.9s steps(4) .5s infinite' }}>✦</span>
      <span style={{ ...base, top: '40%', right: 22, color: '#fff', fontSize: 8, animation: 'twinkle 1.1s steps(4) .9s infinite' }}>✦</span>
    </span>
  );
}

interface CardProps {
  skill: SkillCardModel;
  tipId: string | undefined;
  onOpen: (el: HTMLElement) => void;
  onClose: () => void;
}

function SkillCard({ skill, tipId, onOpen, onClose }: CardProps) {
  const { color, label } = RARITY[skill.rarity];
  const legendary = skill.rarity === 'legendary';
  const open = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => onOpen(e.currentTarget);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') onClose();
  };
  return (
    <li
      tabIndex={0}
      aria-label={`${skill.name}, ${label}, 사용 ${formatUses(skill.uses)}`}
      aria-describedby={tipId}
      className={styles.skillCard}
      onMouseEnter={open}
      onMouseLeave={onClose}
      onFocus={open}
      onBlur={onClose}
      onKeyDown={onKeyDown}
      style={{
        position: 'relative', background: COLOR.well, border: `3px solid ${color}`, padding: 14, display: 'flex', flexDirection: 'column',
        gap: 10, minHeight: 150, minWidth: 0, boxShadow: `0 0 0 3px ${COLOR.ink}`, animation: legendary ? 'glow 2.2s steps(6) infinite' : 'none',
      }}
    >
      {legendary && <Sparkles />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ width: 48, height: 48, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLOR.ink, border: `2px solid ${COLOR.border}` }}>
          <PixelIcon name={skill.icon} scale={4} />
        </div>
        <div style={{ fontSize: 12, whiteSpace: 'nowrap', color, border: `2px solid ${color}`, padding: '2px 6px' }}>{label}</div>
      </div>
      <div style={{ fontFamily: FONT_PIXEL, fontSize: 10, lineHeight: 1.5, color: COLOR.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {skill.name}
      </div>
      {skill.desc && (
        <div className={styles.clamp3} style={{ fontSize: 14, lineHeight: 1.35, color: COLOR.soft, textWrap: 'pretty' }}>
          {skill.desc}
        </div>
      )}
      <div style={{ marginTop: 'auto', fontSize: 12, color: COLOR.dim, display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{skill.name}</span>
        <span style={{ whiteSpace: 'nowrap' }}>{formatUses(skill.uses)}</span>
      </div>
    </li>
  );
}

function SkillTooltip({ id, skill, x, y }: { id: string; skill: SkillCardModel; x: number; y: number }) {
  const { color, label } = RARITY[skill.rarity];
  return (
    <div
      id={id}
      role="tooltip"
      style={{
        position: 'fixed', left: x, top: y, zIndex: 70, width: TIP_WIDTH, maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`, pointerEvents: 'none',
        background: COLOR.well, border: `4px solid ${COLOR.text}`, boxShadow: `0 0 0 3px ${COLOR.ink},6px 6px 0 3px ${COLOR.ink}`, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: FONT_PIXEL, fontSize: 11, color, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{skill.name}</div>
        <div style={{ fontSize: 12, color, whiteSpace: 'nowrap' }}>{label}</div>
      </div>
      <div aria-hidden="true" style={{ height: 2, background: COLOR.border }} />
      {skill.desc && <div style={{ fontSize: 14, lineHeight: 1.4, color: COLOR.text, textWrap: 'pretty' }}>{skill.desc}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: COLOR.muted }}>
        <div>
          ▸ 사용 횟수: <span style={{ color: COLOR.green }}>{formatUses(skill.uses)}</span>
        </div>
        <div>
          ▸ 획득: <span style={{ color: COLOR.soft }}>{skill.acquired}</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  shown: readonly SkillCardModel[];
  total: number;
}

export function InventoryPanel({ shown, total }: Props) {
  const tipId = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [tip]);
  const tipSkill = tip ? shown[tip.index] : undefined;

  return (
    <section aria-label="스킬 인벤토리" className={`${styles.panel} ${styles.areaInventory}`} style={{ gap: 16 }}>
      <div className={styles.inventoryHead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={sectionLabel}>INVENTORY</div>
          <h2 style={{ fontSize: 17, margin: 0, fontWeight: 400 }}>
            스킬 인벤토리 <span style={{ color: COLOR.dim }}>{shown.length} / {total}</span>
          </h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, whiteSpace: 'nowrap' }}>
          {RARITY_ORDER.map((r) => (
            <span key={r} style={{ color: RARITY[r].color }}>
              <span aria-hidden="true">■</span> {RARITY[r].label}
            </span>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: COLOR.muted }}>아직 보여 줄 스킬이 없습니다.</p>
      ) : (
        <ul className={styles.skillGrid} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((skill, index) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              tipId={tip?.index === index ? tipId : undefined}
              onOpen={(el) => setTip({ index, ...placeTip(el.getBoundingClientRect()) })}
              onClose={() => setTip(null)}
            />
          ))}
        </ul>
      )}
      {mounted && tip && tipSkill && createPortal(<SkillTooltip id={tipId} skill={tipSkill} x={tip.x} y={tip.y} />, document.body)}
    </section>
  );
}
