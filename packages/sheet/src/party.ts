// Party members (agents) and passive skills (hooks) (docs/sheet-mapping.md 「칸별 규칙」).
import { hashName, pickByHash } from './hash.js';
import { ICON_NAMES } from './items.js';
import type { MergedAgent, MergedHook } from './merge.js';
import { byCountThenName, compareNames, sortByCount } from './rank.js';
import type { IconName, Passive, PartyClass, PartyMember } from './types.js';

export const PARTY_SIZE = 4;
export const PASSIVE_SIZE = 4;
const ROLE_MAX_LENGTH = 12;
const MODEL_PREFIXES = ['opus-', 'sonnet-', 'haiku-'];
const INLINE_LABEL = 'inline';

/** Whole name segment between `-`, `_`, `.` or the ends, so `console-x` is not `sol`. */
const token = (word: string): RegExp => new RegExp(`(^|[-_.])${word}([-_.]|$)`);

/** First match wins, so Claude families (plain substrings) are checked before the Codex ones (whole segments). */
const CLASS_BY_MODEL: ReadonlyArray<readonly [RegExp, PartyClass]> = [
  [/opus/, '마법사'],
  [/sonnet/, '궁수'],
  [/haiku/, '도적'],
  [/fable/, '현자'],
  // Codex (GPT) families. Plain gpt / codex / o3 / o4 models stay 전사, the same as no match.
  [token('luna'), '궁수'],
  [token('sol'), '마법사'],
  [token('astra'), '도적'],
  [/gpt|codex|o3|o4/, '전사'],
];

/** Badge color per class (design: 마법사 purple, 궁수 green, 전사 pink, 사제/현자 gold). */
export const CLASS_BADGE: Readonly<Record<PartyClass, string>> = {
  마법사: '#b05cff',
  궁수: '#6fe36f',
  도적: '#3b9cff',
  현자: '#ffc23d',
  전사: '#ff6b9d',
};

export const HAIR_PALETTE: readonly string[] = [
  '#5b7cff', '#6fe36f', '#ff8c42', '#ffc23d', '#ff5d73', '#8fd0ff', '#b05cff', '#f6f1e6',
];

/** [cloth, pants] pairs taken from the design's party plus two more in the same palette. */
export const OUTFIT_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#7b4dff', '#3a2c6e'],
  ['#2f8f5f', '#1f4d37'],
  ['#ff5d73', '#7a2231'],
  ['#f6f1e6', '#8f88ad'],
  ['#3b9cff', '#1f3f7a'],
  ['#ff8c42', '#7a3f12'],
];

export function roleBadge(name: string): string {
  const prefix = MODEL_PREFIXES.find((p) => name.startsWith(p));
  const base = prefix ? name.slice(prefix.length) : name;
  return base.toUpperCase().slice(0, ROLE_MAX_LENGTH);
}

export function partyClass(model: string | null): PartyClass {
  const lower = (model ?? '').toLowerCase();
  return CLASS_BY_MODEL.find(([pattern]) => pattern.test(lower))?.[1] ?? '전사';
}

export function buildParty(agents: readonly MergedAgent[], showDescriptions: boolean): PartyMember[] {
  return sortByCount(agents.map((a) => ({ ...a, count: a.uses })))
    .slice(0, PARTY_SIZE)
    .map((a) => {
      const cls = partyClass(a.model);
      const [cloth, pants] = OUTFIT_PALETTE[hashName(`outfit:${a.name}`) % OUTFIT_PALETTE.length] as readonly [string, string];
      return {
        name: a.name,
        role: roleBadge(a.name),
        cls,
        model: a.model,
        uses: a.uses,
        desc: showDescriptions ? a.desc : '',
        hair: pickByHash(`hair:${a.name}`, HAIR_PALETTE),
        cloth,
        pants,
        badge: CLASS_BADGE[cls],
      };
    });
}

export const EVENT_PRIORITY: readonly string[] = [
  'PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SessionStart', 'SessionEnd', 'UserPromptSubmit',
];

export const PASSIVE_DEFAULT_NAMES: Readonly<Record<string, string>> = {
  PreToolUse: '도구 사용 전 검문',
  PostToolUse: '사용 후 정리',
  Stop: '마무리 의식',
  Notification: '알림 종',
  SessionStart: '출정 준비',
  SessionEnd: '귀환 기록',
  UserPromptSubmit: '명령 해석',
};

const EVENT_ICONS: Readonly<Record<string, IconName>> = {
  PreToolUse: 'shield',
  PostToolUse: 'gear',
  Stop: 'scroll',
  Notification: 'bolt',
  SessionStart: 'star',
  SessionEnd: 'book',
  UserPromptSubmit: 'eye',
};

/** Most frequent non-inline label (ties by name), or the event's default name. */
function passiveName(event: string, hooks: readonly MergedHook[]): string {
  const counts = new Map<string, number>();
  for (const h of hooks) if (h.label !== INLINE_LABEL) counts.set(h.label, (counts.get(h.label) ?? 0) + 1);
  const best = [...counts].map(([name, count]) => ({ name, count })).sort(byCountThenName)[0];
  return best?.name ?? PASSIVE_DEFAULT_NAMES[event] ?? event;
}

/** Priority events first in the listed order, then any other events by handler count and name. */
function compareEvents(a: { name: string; count: number }, b: { name: string; count: number }): number {
  const pa = EVENT_PRIORITY.indexOf(a.name);
  const pb = EVENT_PRIORITY.indexOf(b.name);
  if (pa !== -1 || pb !== -1) return (pa === -1 ? Infinity : pa) - (pb === -1 ? Infinity : pb);
  return b.count - a.count || compareNames(a.name, b.name);
}

export function buildPassives(hooks: readonly MergedHook[]): Passive[] {
  const byEvent = new Map<string, MergedHook[]>();
  for (const h of hooks) byEvent.set(h.event, [...(byEvent.get(h.event) ?? []), h]);
  return [...byEvent]
    .map(([name, list]) => ({ name, count: list.length, list }))
    .sort(compareEvents)
    .slice(0, PASSIVE_SIZE)
    .map(({ name, count, list }) => ({
      event: name,
      name: passiveName(name, list),
      desc: `핸들러 ${count}개`,
      icon: EVENT_ICONS[name] ?? pickByHash(name, ICON_NAMES),
      handlers: count,
    }));
}
