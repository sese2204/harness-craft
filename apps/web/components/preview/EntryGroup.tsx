'use client';

import { useId, useState } from 'react';
import type { HiddenKind, VisibilityEntry } from '@harness-craft/sheet';

import styles from './preview.module.css';

const COLLAPSED_COUNT = 8;

const ORIGIN_SHORT = { claude: 'CC', codex: 'CX' } as const;

interface Props {
  kind: HiddenKind;
  title: string;
  entries: readonly VisibilityEntry[];
  hidden: readonly string[];
  onToggle: (key: string, isVisible: boolean) => void;
  onSetAll: (isVisible: boolean) => void;
}

function countLabel(kind: HiddenKind, count: number): string {
  const n = count.toLocaleString('en-US');
  return kind === 'hooks' ? `핸들러 ${n}` : `${n}회`;
}

export function EntryGroup({ kind, title, entries, hidden, onToggle, onSetAll }: Props) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [isExpanded, setIsExpanded] = useState(false);
  const hiddenSet = new Set(hidden);
  const visibleCount = entries.filter((e) => !hiddenSet.has(e.key)).length;
  const shown = isExpanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const rest = entries.length - COLLAPSED_COUNT;

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLegend}>
        {title} <span className={styles.dim}>{visibleCount} / {entries.length} 공개</span>
      </legend>
      {entries.length === 0 ? (
        <p className={styles.empty}>항목이 없습니다.</p>
      ) : (
        <>
          <div className={styles.groupActions}>
            <button type="button" className={styles.smallButton} onClick={() => onSetAll(true)}>
              모두 공개
            </button>
            <button type="button" className={styles.smallButton} onClick={() => onSetAll(false)}>
              모두 숨김
            </button>
          </div>
          <ul id={listId} className={styles.entryList}>
            {shown.map((entry, i) => {
              const id = `${baseId}-${i}`;
              const isVisible = !hiddenSet.has(entry.key);
              return (
                <li key={entry.key} className={styles.entry}>
                  <input id={id} type="checkbox" checked={isVisible} onChange={(e) => onToggle(entry.key, e.target.checked)} />
                  <label htmlFor={id} className={styles.entryLabel}>
                    <span className={styles.entryName}>{entry.label}</span>
                    <span className={styles.entryMeta}>
                      {entry.origins.map((o) => ORIGIN_SHORT[o]).join('+')} · {countLabel(kind, entry.count)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {rest > 0 && (
            <button type="button" className={styles.moreButton} aria-expanded={isExpanded} aria-controls={listId} onClick={() => setIsExpanded((v) => !v)}>
              {isExpanded ? '접기 ▴' : `${rest}개 더 보기 ▾`}
            </button>
          )}
        </>
      )}
    </fieldset>
  );
}
