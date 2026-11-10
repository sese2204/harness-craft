'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EquipSlot, EquipSlotId, SheetModel } from '@harness-craft/sheet';

import { HERO_EQ, HERO_PAL, PixelArt, PixelIcon } from './pixel';
import styles from './sheet.module.css';
import { COLOR, FONT_PIXEL, RARITY, formatNumber, formatUses, sectionLabel } from './theme';

const STAGE_W = 328;
const STAGE_H = 400;
const EMPTY_SLOT_COLOR = COLOR.border;

/** x,y = slot box in the 328×400 stage; tx,ty = body point the connector targets (design EQUIP table). */
const SLOT_POS: Readonly<Record<EquipSlotId, { x: number; y: number; tx: number; ty: number }>> = {
  armor: { x: 6, y: 16, tx: 143, ty: 152 },
  offhand: { x: 6, y: 150, tx: 89, ty: 190 },
  boots: { x: 6, y: 284, tx: 125, ty: 286 },
  helmet: { x: 252, y: 16, tx: 197, ty: 64 },
  accessory: { x: 252, y: 150, tx: 179, ty: 142 },
  weapon: { x: 252, y: 284, tx: 239, ty: 112 },
};

/** Scales the fixed-coordinate stage down when the panel is narrower than 328px. */
function useFitScale(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return { ref, scale };
}

function slotColor(slot: EquipSlot): string {
  return slot.item ? RARITY[slot.item.rarity].color : EMPTY_SLOT_COLOR;
}

function slotTitle(slot: EquipSlot): string {
  if (!slot.item) return `${slot.label} · 빈 칸`;
  const parts = [`${slot.item.name} (${RARITY[slot.item.rarity].label})`, `호출 ${formatUses(slot.item.calls)}`];
  return slot.item.desc ? [...parts, slot.item.desc].join(' · ') : parts.join(' · ');
}

function Connectors({ equipment }: { equipment: readonly EquipSlot[] }) {
  return (
    <svg
      aria-hidden="true"
      width="322"
      height="394"
      viewBox="0 0 322 394"
      style={{ position: 'absolute', inset: 0, shapeRendering: 'crispEdges', pointerEvents: 'none' }}
    >
      {equipment.map((slot) => {
        if (!slot.item) return null;
        const p = SLOT_POS[slot.slot];
        const color = slotColor(slot);
        return (
          <g key={slot.slot}>
            <line x1={p.x < 100 ? 70 : 252} y1={p.y + 32} x2={p.tx} y2={p.ty} stroke={color} strokeWidth="2" strokeDasharray="4 3" />
            <rect x={p.tx - 4} y={p.ty - 4} width="8" height="8" fill={color} stroke={COLOR.ink} strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}

function SlotBox({ slot }: { slot: EquipSlot }) {
  const p = SLOT_POS[slot.slot];
  const color = slotColor(slot);
  const box: CSSProperties = {
    width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: COLOR.panel, border: `3px ${slot.item ? 'solid' : 'dashed'} ${color}`, boxShadow: `0 0 0 2px ${COLOR.ink}`,
  };
  return (
    <li
      title={slotTitle(slot)}
      style={{ position: 'absolute', left: p.x, top: p.y, width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
    >
      <div style={box}>{slot.item && <PixelIcon name={slot.item.icon} scale={5} />}</div>
      <div
        className={styles.equipLabel}
        style={{ fontSize: 12, color: slot.item ? COLOR.soft : COLOR.dim, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap' }}
      >
        {slot.item ? slot.item.name : '빈 칸'}
      </div>
      <div style={{ fontSize: 11, color: COLOR.dim, lineHeight: 1 }}>{slot.label}</div>
    </li>
  );
}

function EquipStage({ equipment }: { equipment: readonly EquipSlot[] }) {
  const { ref, scale } = useFitScale(STAGE_W);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ width: STAGE_W * scale, height: STAGE_H * scale, margin: '0 auto' }}>
        <div
          style={{
            position: 'relative', width: STAGE_W, height: STAGE_H, background: COLOR.well, border: `3px solid ${COLOR.border}`,
            boxShadow: `inset 0 0 0 3px ${COLOR.ink}`, overflow: 'hidden', transform: `scale(${scale})`, transformOrigin: 'top left',
          }}
        >
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 322, height: 3, background: COLOR.grid }} />
          <div aria-hidden="true" style={{ position: 'absolute', left: 96, top: 308, width: 130, height: 10, background: COLOR.ink, borderRadius: '50%' }} />
          <Connectors equipment={equipment} />
          <div style={{ position: 'absolute', left: 65, top: 40, animation: 'bob 1.6s steps(2) infinite' }}>
            <PixelArt rows={HERO_EQ} scale={12} pal={HERO_PAL} />
          </div>
          <ul aria-label="장착한 MCP 장비" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {equipment.map((slot) => (
              <SlotBox key={slot.slot} slot={slot} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function CharacterPanel({ model }: { model: SheetModel }) {
  const { level } = model;
  const percent = Math.round(level.progress * 100);
  return (
    <section aria-label="캐릭터" className={`${styles.panel} ${styles.areaCharacter}`} style={{ gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ ...sectionLabel, margin: 0, fontWeight: 400 }}>CHARACTER</h2>
        <div style={{ fontFamily: FONT_PIXEL, fontSize: 10, color: COLOR.green }}>● ONLINE</div>
      </div>
      <EquipStage equipment={model.equipment} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT_PIXEL, fontSize: 16, color: COLOR.text, overflowWrap: 'anywhere' }}>@{model.handle}</div>
        <div style={{ display: 'inline-block', fontSize: 14, color: COLOR.page, background: COLOR.pink, padding: '4px 10px', boxShadow: `2px 2px 0 ${COLOR.ink}` }}>
          ✦ {model.title} ✦
        </div>
        <div style={{ fontSize: 13, color: COLOR.muted }}>{model.equipSummary}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', fontFamily: FONT_PIXEL, fontSize: 11 }}>
          <span style={{ color: COLOR.gold }}>LV.{level.level}</span>
          <span style={{ color: COLOR.muted }}>
            EXP {formatNumber(level.current)} / {formatNumber(level.needed)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`다음 레벨까지 경험치 ${percent}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={{ height: 18, background: COLOR.ink, border: `3px solid ${COLOR.border}`, padding: 2 }}
        >
          <div
            style={{
              height: '100%', width: `${percent}%`, background: 'repeating-linear-gradient(90deg,#6fe36f 0 6px,#4fbf4f 6px 8px)',
              boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.25)',
            }}
          />
        </div>
      </div>
    </section>
  );
}
