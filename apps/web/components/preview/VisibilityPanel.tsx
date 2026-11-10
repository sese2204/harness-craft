'use client';

import { useId } from 'react';
import { HANDLE_MAX_LENGTH, HIDDEN_KINDS, type HiddenKind, type VisibilityEntries } from '@harness-craft/sheet';

import { EntryGroup } from './EntryGroup';
import styles from './preview.module.css';
import type { PreviewSettings } from './settings';

const GROUP_TITLES: Readonly<Record<HiddenKind, string>> = {
  mcp: 'MCP 장비',
  skills: '스킬',
  agents: '서브에이전트',
  hooks: '훅',
};

interface Props {
  settings: PreviewSettings;
  entries: VisibilityEntries;
  onChange: (next: PreviewSettings) => void;
}

function withHidden(settings: PreviewSettings, kind: HiddenKind, hidden: string[]): PreviewSettings {
  return { ...settings, hidden: { ...settings.hidden, [kind]: hidden } };
}

export function VisibilityPanel({ settings, entries, onChange }: Props) {
  const handleId = useId();
  const descId = useId();
  const scanId = useId();

  const toggle = (kind: HiddenKind, key: string, isVisible: boolean) => {
    const current = settings.hidden[kind].filter((k) => k !== key);
    onChange(withHidden(settings, kind, isVisible ? current : [...current, key]));
  };
  const setAll = (kind: HiddenKind, isVisible: boolean) => {
    const keys = new Set(entries[kind].map((e) => e.key));
    const others = settings.hidden[kind].filter((k) => !keys.has(k));
    onChange(withHidden(settings, kind, isVisible ? others : [...others, ...keys]));
  };

  return (
    <div className={styles.settings}>
      <div className={styles.field}>
        <label htmlFor={handleId} className={styles.fieldLabel}>
          핸들
        </label>
        <div className={styles.handleInput}>
          <span aria-hidden="true">@</span>
          <input
            id={handleId}
            type="text"
            value={settings.handle}
            maxLength={HANDLE_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange({ ...settings, handle: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.toggleRow}>
        <input id={descId} type="checkbox" checked={settings.showDescriptions} onChange={(e) => onChange({ ...settings, showDescriptions: e.target.checked })} />
        <label htmlFor={descId}>
          설명 공개 <span className={styles.dim}>스킬·에이전트·MCP 설명을 시트에 보입니다</span>
        </label>
      </div>
      <div className={styles.toggleRow}>
        <input id={scanId} type="checkbox" checked={settings.scanlines} onChange={(e) => onChange({ ...settings, scanlines: e.target.checked })} />
        <label htmlFor={scanId}>스캔라인 효과</label>
      </div>
      <div className={styles.groups}>
        {HIDDEN_KINDS.map((kind) => (
          <EntryGroup
            key={kind}
            kind={kind}
            title={GROUP_TITLES[kind]}
            entries={entries[kind]}
            hidden={settings.hidden[kind]}
            onToggle={(key, isVisible) => toggle(kind, key, isVisible)}
            onSetAll={(isVisible) => setAll(kind, isVisible)}
          />
        ))}
      </div>
    </div>
  );
}
