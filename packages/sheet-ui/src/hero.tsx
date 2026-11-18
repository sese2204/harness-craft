// The main character drawn from what is actually equipped: a bare body plus one layer per filled slot, shaped by the
// item's rarity, and the weapon/off-hand items held as their own icons (docs/sheet-mapping.md 「본체 캐릭터」).
import type { CSSProperties } from 'react';
import { CLASS_BADGE, type EquipSlot, type EquipSlotId, type HeroInfo, type PartyClass, type Rarity, type StageKind } from '@harness-craft/sheet';

import { PixelArt, PixelIcon } from './pixel';
import styles from './sheet.module.css';
import { RARITY } from './theme';

type Palette = Readonly<Record<string, string>>;
type Rows = readonly string[];

/** Hero grid is 16×22 cells; every layer below uses the same grid ('.' = transparent). */
export const HERO_SCALE = 12;
const GRID_W = 16;
const GRID_H = 22;

const BODY: Rows = [
  '................', '................', '.....hhhhhh.....', '....hhhhhhhh....',
  '...hhSSSSSShh...', '...SSKKSSKKSS...', '...SSSSSSSSSS...', '....SSRSSRSS....',
  '......SSSS......', '.....CCCCCC.....', '....CCCCCCCC....', '...SCCCCCCCCS...',
  '...SCCCCCCCCS...', '....CCCCCCCC....', '....CCCCCCCC....', '.....CCCCCC.....',
  '.....PPPPPP.....', '.....PP..PP.....', '.....PP..PP.....', '.....SS..SS.....',
  '................', '................',
];
const BODY_PAL: Palette = { h: '#7a5230', S: '#f2c9a0', K: '#1a1626', R: '#ff9ad0', C: '#d9cdb4', P: '#4a4458' };

/** Per-tier rows, top-aligned at `top` (grid row). */
type Piece = { top: number; rows: Rows };

const HELMET: Readonly<Record<Rarity, Piece>> = {
  // bandana with a knot
  common: { top: 2, rows: ['.....XXXXXX.....', '....XXXXXXXX.X..', '.............XX.'] },
  // iron helm with cheek guards
  rare: { top: 1, rows: ['......XXXX......', '....XxXXXXXX....', '...XxXXXXXXXX...', '...XX......XX...'] },
  // horned helm
  epic: { top: 0, rows: ['..n..........n..', '..nn..XXXX..nn..', '...nXxXXXXXXn...', '...XxXXXXXXXX...', '...XX......XX...'] },
  // crown with gems
  legendary: { top: 0, rows: ['....Y..YY..Y....', '....YY.YY.YY....', '....YgYYYYgY....', '....xxxxxxxx....'] },
};

const ARMOR: Readonly<Record<Rarity, Piece>> = {
  // leather vest over the tunic
  common: { top: 9, rows: ['.....XX..XX.....', '....XXX..XXX....', '....XXXXXXXX....', '....XXXXXXXX....', '....XXXXXXXX....', '....tttttttt....'] },
  // plate with pauldrons
  rare: { top: 9, rows: ['.....XXXXXX.....', '...XxXXXXXXxX...', '....XXXXXXXX....', '....XXxxXXXX....', '....XXXXXXXX....', '....tttttttt....', '.....XXXXXX.....'] },
  // spiked plate with gold trim
  epic: { top: 9, rows: ['...n.XXXXXX.n...', '...XxXXXXXXxX...', '....XyXXXXyX....', '....XyXxxXyX....', '....XyXXXXyX....', '....tttttttt....', '.....XXXXXX.....'] },
  // gold plate with a gem; the cape is drawn behind the body (CAPE)
  legendary: { top: 9, rows: ['...y.XXXXXX.y...', '...XxXXXXXXxX...', '....XyXXXXyX....', '....XyXggXyX....', '....XyXXXXyX....', '....tttttttt....', '.....XXXXXX.....'] },
};

const CAPE: Piece = {
  top: 9,
  rows: ['....cccccccc....', '...cccccccccc...', '..cccccccccccc..', '..cccccccccccc..', '..cccccccccccc..', '..cccccccccccc..',
    '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '..cc........cc..'],
};

const BOOTS: Readonly<Record<Rarity, Piece>> = {
  common: { top: 19, rows: ['.....XX..XX.....'] },
  rare: { top: 18, rows: ['.....XX..XX.....', '....XXX..XXX....'] },
  epic: { top: 17, rows: ['.....yy..yy.....', '.....XX..XX.....', '....XXX..XXX....'] },
  legendary: { top: 17, rows: ['.....yy..yy.....', '..w..XX..XX..w..', '.ww.XXX..XXX.ww.'] },
};

/** Necklace; only the gem colour changes with rarity. */
const AMULET: Piece = { top: 9, rows: ['.....y....y.....', '......y..y......', '.......gg.......'] };

const TIER_PAL: Readonly<Record<Rarity, Palette>> = {
  common: { X: '#8a5a34', x: '#b07a4a', t: '#5a3a20' },
  rare: { X: '#9aa3ad', x: '#eef3f8', t: '#2f6fd6' },
  epic: { X: '#7d4bd1', x: '#c49bff', y: '#ffc23d', n: '#f6f1e6', t: '#3a2370' },
  legendary: { X: '#ffc23d', x: '#fff3c4', y: '#ff8c42', g: '#ff5d73', t: '#b07a1a', w: '#f6f1e6', Y: '#ffc23d', c: '#d6324a' },
};

/** Where held items sit relative to the hero box, in px (icons are 8×8 at scale 6). */
const HELD_SCALE = 6;
const HELD_POS: Readonly<Record<'weapon' | 'offhand', { left: number; top: number }>> = {
  weapon: { left: 132, top: 108 },
  offhand: { left: 8, top: 114 },
};

/** Body points the slot connectors aim at, in hero-box px. */
export const HERO_ANCHORS: Readonly<Record<EquipSlotId, { x: number; y: number }>> = {
  helmet: { x: 102, y: 30 },
  armor: { x: 102, y: 150 },
  offhand: { x: 32, y: 138 },
  boots: { x: 78, y: 230 },
  accessory: { x: 102, y: 128 },
  weapon: { x: 156, y: 132 },
};

function place(piece: Piece): Rows {
  const blank = '.'.repeat(GRID_W);
  return Array.from({ length: GRID_H }, (_, y) => piece.rows[y - piece.top] ?? blank);
}

function effectClass(rarity: Rarity): string | undefined {
  if (rarity === 'legendary') return styles.fxLegendary;
  if (rarity === 'epic') return styles.fxEpic;
  return undefined;
}

function Layer({ rows, pal, rarity }: { rows: Rows; pal: Palette; rarity?: Rarity }) {
  return (
    <div className={rarity ? effectClass(rarity) : undefined} style={{ position: 'absolute', inset: 0 }}>
      <PixelArt rows={rows} scale={HERO_SCALE} pal={pal} />
    </div>
  );
}

function Held({ slot }: { slot: EquipSlot }) {
  if (!slot.item || (slot.slot !== 'weapon' && slot.slot !== 'offhand')) return null;
  const pos = HELD_POS[slot.slot];
  return (
    <div className={effectClass(slot.item.rarity)} style={{ position: 'absolute', left: pos.left, top: pos.top }}>
      <PixelIcon name={slot.item.icon} scale={HELD_SCALE} />
    </div>
  );
}

const SPARKLES: ReadonlyArray<{ left: number; top: number; delay: number; size: number }> = [
  { left: 8, top: 64, delay: 0, size: 6 },
  { left: 178, top: 52, delay: 0.7, size: 6 },
  { left: 170, top: 196, delay: 1.3, size: 4 },
  { left: 16, top: 204, delay: 1.9, size: 4 },
  { left: 92, top: 4, delay: 2.4, size: 4 },
];

function Sparkles() {
  return (
    <>
      {SPARKLES.map((s) => (
        <span
          key={`${s.left}:${s.top}`}
          className={styles.fxSparkle}
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
    </>
  );
}

/** Ground effect under the feet: gold aura with any legendary, a rune ring when every slot is epic or better. */
export function HeroGround({ equipment, hero, left, top }: { equipment: readonly EquipSlot[]; hero?: HeroInfo; left: number; top: number }) {
  const items = equipment.map((s) => s.item);
  const fullSet = items.every((i) => i && (i.rarity === 'epic' || i.rarity === 'legendary'));
  const legendary = items.some((i) => i?.rarity === 'legendary');
  const awakened = hero?.rank === '각성' ? CLASS_BADGE[hero.cls] : null;
  if (!fullSet && !legendary && !awakened) return null;
  const ring: CSSProperties = { position: 'absolute', left, top, width: 150, height: 22 };
  return (
    <div aria-hidden="true" style={ring}>
      {awakened && (
        <div className={styles.fxAura} style={{ inset: '-14px -18px', background: `radial-gradient(ellipse at center, ${awakened}99 0, ${awakened}26 55%, transparent 72%)` }} />
      )}
      {legendary && <div className={styles.fxAura} />}
      {fullSet && <div className={styles.fxRunes} />}
    </div>
  );
}

export function heroLabel(equipment: readonly EquipSlot[]): string {
  const worn = equipment.filter((s) => s.item);
  if (worn.length === 0) return '아무것도 장착하지 않은 캐릭터';
  return `${worn.map((s) => `${s.label} ${s.item?.name} (${s.item ? RARITY[s.item.rarity].label : ''})`).join(', ')} 장착`;
}

/** Rows of the hero shown in a slot box: that body part wearing the piece (columns 2–13). */
const CROP: Readonly<Record<'helmet' | 'armor' | 'boots' | 'accessory', { from: number; to: number }>> = {
  helmet: { from: 0, to: 8 },
  armor: { from: 8, to: 17 },
  accessory: { from: 7, to: 13 },
  boots: { from: 15, to: 20 },
};
const CROP_LEFT = 2;
const CROP_RIGHT = 14;

function pieceLayers(slot: keyof typeof CROP, r: Rarity, hero: HeroInfo | undefined): LayerSpec[] {
  if (slot === 'helmet') return headLayers(hero, r);
  if (slot === 'armor') return [{ rows: place(ARMOR[r]), pal: TIER_PAL[r], rarity: r }];
  if (slot === 'boots') return [{ rows: place(BOOTS[r]), pal: TIER_PAL[r], rarity: r }];
  return [{ rows: place(AMULET), pal: { y: '#ffc23d', g: RARITY[r].color }, rarity: r }];
}

function crop(rows: Rows, slot: keyof typeof CROP): Rows {
  const { from, to } = CROP[slot];
  return rows.slice(from, to).map((r) => r.slice(CROP_LEFT, CROP_RIGHT));
}

/** The hero's body part wearing this slot's piece, sized to fit `box` px. Null for held slots (they show the MCP icon). */
export function WornPiece({ slot, rarity, box, hero }: { slot: EquipSlotId; rarity: Rarity; box: number; hero?: HeroInfo }) {
  if (slot === 'weapon' || slot === 'offhand') return null;
  const bodyPal = bodyPalette(hero);
  const look = hero && hero.rank !== '견습' ? CLASS_LOOK[hero.cls] : null;
  const layers: LayerSpec[] = [
    { rows: BODY, pal: bodyPal },
    ...(look?.marks ?? []).map((m) => ({ rows: place(m), pal: bodyPal })),
    ...pieceLayers(slot, rarity, hero),
  ];
  const height = CROP[slot].to - CROP[slot].from;
  const scale = Math.max(2, Math.floor(box / Math.max(height, CROP_RIGHT - CROP_LEFT)));
  return (
    <div style={{ position: 'relative', width: (CROP_RIGHT - CROP_LEFT) * scale, height: height * scale }}>
      {layers.map((l, i) => (
        <div key={i} className={l.rarity ? effectClass(l.rarity) : undefined} style={{ position: 'absolute', inset: 0 }}>
          <PixelArt rows={crop(l.rows, slot)} scale={scale} pal={l.pal} />
        </div>
      ))}
    </div>
  );
}

/* ---- Class outfit (main model) and rank (level) ---- */

type ClassLook = {
  /** Overrides of BODY_PAL plus colours used by this class's pieces. */
  pal: Palette;
  /** Worn from 정식 on. */
  head: Piece;
  /**
   * How an equipped helmet shows on the class headgear: a band in the helmet's rarity colours (TRIM_PAL), plus a
   * legendary extra. null = the class wears the helmet pieces themselves (전사: iron helm, horned helm, crown).
   */
  trim: { band: Piece; legendary: Piece | null } | null;
  /** Always worn from 정식 on (robe skirt, mask, beard). */
  marks: readonly Piece[];
};

const ROBE_SKIRT: Piece = { top: 15, rows: ['....CCCCCCCC....', '....CCCCCCCC....', '...CCCCCCCCCC...', '...CCCCCCCCCC...'] };
const HOOD: Piece = { top: 2, rows: ['.....OOOOOO.....', '....OOOOOOOO....', '...OO......OO...', '...O........O...'] };
const HOOD_BAND: Piece = { top: 3, rows: ['....XXXggXXX....'] };

/** Helmet colours when worn as a band on class headgear. */
const TRIM_PAL: Readonly<Record<Rarity, Palette>> = {
  common: { X: '#8a5a34', g: '#b07a4a' },
  rare: { X: '#c3cad2', g: '#3b9cff' },
  epic: { X: '#7d4bd1', g: '#ffc23d' },
  legendary: { X: '#ffc23d', g: '#ff5d73', Y: '#ffc23d' },
};

/** Throne-room stage (Claude Max, ChatGPT Pro): red mantle with an ermine collar and gold hem. */
const ROYAL_CAPE: Piece = {
  top: 9,
  rows: ['....eeeeeeee....', '...ekeekeekee...', '..cccccccccccc..', '..cccccccccccc..', '..cccccccccccc..', '..cccccccccccc..',
    '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.yyyyyyyyyyyyyy.', '..cc........cc..'],
};
const ROYAL_PAL: Palette = { c: '#a0182e', e: '#f6f1e6', k: '#1a1626', y: '#ffc23d' };

const CLASS_LOOK: Readonly<Record<PartyClass, ClassLook>> = {
  마법사: {
    pal: { C: '#4b3bbf', P: '#2e2470', W: '#4b3bbf', w: '#6a5ae0', y: '#ffc23d' },
    head: { top: 0, rows: ['.......WW.......', '......WwWW......', '.....WWyWWW.....', '....WWWWwWWW....', '..WWWWWWWWWWWW..'] },
    // band round the hat; a legendary helmet turns the tip into a gold star
    trim: { band: { top: 3, rows: ['....XXXggXXX....'] }, legendary: { top: 0, rows: ['.......YY.......', '......YgYY......'] } },
    marks: [ROBE_SKIRT],
  },
  궁수: {
    pal: { C: '#2f8f5f', P: '#5a3a20', O: '#1f6b45', q: '#7a5230' },
    head: HOOD,
    // circlet over the hood; legendary adds a feather
    trim: { band: HOOD_BAND, legendary: { top: 0, rows: ['............Y...', '...........YY...', '...........Y....'] } },
    marks: [{ top: 9, rows: ['..........q.....', '.........q......', '........q.......', '.......q........'] }],
  },
  도적: {
    pal: { C: '#2a2a3a', P: '#1a1a26', O: '#3a3550', M: '#3a3550' },
    head: HOOD,
    // legendary: gold clasps on the mask
    trim: { band: HOOD_BAND, legendary: { top: 7, rows: ['...Y........Y...'] } },
    marks: [{ top: 7, rows: ['....MMMMMMMM....'] }],
  },
  현자: {
    pal: { C: '#e8e2d0', P: '#b8ad90', h: '#f6f1e6', B: '#f6f1e6', y: '#ffc23d' },
    head: { top: 2, rows: ['.....yyyyyy.....'] },
    // the circlet itself takes the helmet's colours; legendary adds a halo
    trim: { band: { top: 2, rows: ['.....XXggXX.....'] }, legendary: { top: 0, rows: ['.....YYYYYY.....'] } },
    marks: [ROBE_SKIRT, { top: 7, rows: ['....BBBBBBBB....', '.....BBBBBB.....', '......BBBB......'] }],
  },
  전사: {
    pal: { C: '#b8323f', P: '#4a4458', R: '#d6324a' },
    head: { top: 3, rows: ['....RRRRRRRR....', '............RR..'] },
    trim: null,
    marks: [],
  },
};

/** Diagonal sash in the second class's colour (both tools used). */
const SASH: Piece = { top: 9, rows: ['....ss..........', '.....ss.........', '......ss........', '.......ss.......', '........ss......', '.........ss.....'] };

/** Capes use a darker shade of the class colour so they sit behind the outfit. */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) * factor).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

type LayerSpec = { rows: Rows; pal: Palette; rarity?: Rarity };

/**
 * Everything on the head. 견습 and 전사 wear the helmet pieces (bandana → crown) or, empty-headed, the class head;
 * other classes always keep their headgear, and a helmet adds a band in its rarity colours (legendary: an extra).
 */
function headLayers(hero: HeroInfo | undefined, helmet: Rarity | null): LayerSpec[] {
  const look = hero && hero.rank !== '견습' ? CLASS_LOOK[hero.cls] : null;
  if (!look || !look.trim) {
    if (helmet) return [{ rows: place(HELMET[helmet]), pal: TIER_PAL[helmet], rarity: helmet }];
    return look ? [{ rows: place(look.head), pal: bodyPalette(hero) }] : [];
  }
  const out: LayerSpec[] = [{ rows: place(look.head), pal: bodyPalette(hero) }];
  if (helmet) {
    out.push({ rows: place(look.trim.band), pal: TRIM_PAL[helmet], rarity: helmet });
    if (helmet === 'legendary' && look.trim.legendary) out.push({ rows: place(look.trim.legendary), pal: TRIM_PAL.legendary, rarity: helmet });
  }
  return out;
}

function bodyPalette(hero: HeroInfo | undefined): Palette {
  if (!hero || hero.rank === '견습') return BODY_PAL;
  const look = CLASS_LOOK[hero.cls];
  const pal: Record<string, string> = { ...BODY_PAL, ...look.pal };
  if (hero.rank === '각성') pal.K = CLASS_BADGE[hero.cls];
  return pal;
}

export function heroClassLabel(hero: HeroInfo): string {
  return hero.secondary ? `${hero.rank} ${hero.cls} / ${hero.secondary}` : `${hero.rank} ${hero.cls}`;
}

/** Hero box is 192×264 px (16×22 cells at scale 12). Parent positions it and applies the idle bob. */
export function HeroFigure({ equipment, hero, stage }: { equipment: readonly EquipSlot[]; hero?: HeroInfo; stage?: StageKind | null }) {
  const bySlot = new Map(equipment.map((s) => [s.slot, s] as const));
  const tier = (id: EquipSlotId): Rarity | null => bySlot.get(id)?.item?.rarity ?? null;
  const helmet = tier('helmet');
  const armor = tier('armor');
  const boots = tier('boots');
  const accessory = tier('accessory');
  const legendary = equipment.some((s) => s.item?.rarity === 'legendary');
  const dressed = hero !== undefined && hero.rank !== '견습';
  const look = dressed ? CLASS_LOOK[hero.cls] : null;
  const bodyPal = bodyPalette(hero);
  const classCape = hero && (hero.rank === '숙련' || hero.rank === '각성') ? shade(CLASS_BADGE[hero.cls], 0.55) : null;
  const secondaryColor = dressed && hero.secondary ? CLASS_BADGE[hero.secondary] : null;
  const label = hero ? `${heroClassLabel(hero)}, ${heroLabel(equipment)}` : heroLabel(equipment);
  return (
    <div role="img" aria-label={label} style={{ position: 'relative', width: GRID_W * HERO_SCALE, height: GRID_H * HERO_SCALE }}>
      {armor === 'legendary' ? (
        <Layer rows={place(CAPE)} pal={TIER_PAL.legendary} />
      ) : stage === 'throne' ? (
        <Layer rows={place(ROYAL_CAPE)} pal={ROYAL_PAL} />
      ) : (
        classCape && <Layer rows={place(CAPE)} pal={{ c: classCape }} />
      )}
      <Layer rows={BODY} pal={bodyPal} />
      {look?.marks.map((m, i) => <Layer key={i} rows={place(m)} pal={bodyPal} />)}
      {boots && <Layer rows={place(BOOTS[boots])} pal={TIER_PAL[boots]} rarity={boots} />}
      {armor && <Layer rows={place(ARMOR[armor])} pal={TIER_PAL[armor]} rarity={armor} />}
      {accessory && (
        <Layer rows={place(AMULET)} pal={{ y: '#ffc23d', g: RARITY[accessory].color }} rarity={accessory} />
      )}
      {headLayers(hero, helmet).map((l, i) => (
        <Layer key={`head${i}`} rows={l.rows} pal={l.pal} rarity={l.rarity} />
      ))}
      {secondaryColor && <Layer rows={place(SASH)} pal={{ s: secondaryColor }} />}
      {equipment.map((slot) => (
        <Held key={slot.slot} slot={slot} />
      ))}
      {legendary && <Sparkles />}
    </div>
  );
}
