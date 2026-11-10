'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Origin, SheetModel } from '@harness-craft/sheet';

import { CharacterPanel } from './CharacterPanel';
import { InventoryPanel } from './InventoryPanel';
import { PartyPanel } from './PartyPanel';
import { PassivePanel } from './PassivePanel';
import styles from './sheet.module.css';
import { StatsPanel } from './StatsPanel';
import { COLOR, FONT_PIXEL } from './theme';

export interface ShareAction {
  label: string;
  onShare: () => void;
}

export interface CharacterSheetProps {
  model: SheetModel;
  scanlines?: boolean;
  /** Omit until sharing exists: the button renders disabled with a "곧 지원" hint. */
  share?: ShareAction;
}

const SOURCE_NAMES: Readonly<Record<Origin, string>> = { claude: 'Claude Code', codex: 'Codex' };

function sourceTitle(sources: readonly Origin[]): string {
  const names = sources.length > 0 ? sources.map((s) => SOURCE_NAMES[s]) : [SOURCE_NAMES.claude];
  return `${names.join(' · ')} 캐릭터 시트`;
}

function ShareButton({ share }: { share?: ShareAction }) {
  const hintId = useId();
  if (share) {
    return (
      <button type="button" className={styles.shareButton} onClick={share.onShare}>
        {share.label}
      </button>
    );
  }
  return (
    <span className={styles.shareWrap}>
      <button type="button" className={styles.shareButton} aria-disabled="true" aria-describedby={hintId}>
        공유하기
      </button>
      <span id={hintId} role="tooltip" className={styles.soonTip}>
        곧 지원
      </span>
    </span>
  );
}

function Scanlines() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60, background: 'repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 2px,transparent 2px 4px)' }}
    />,
    document.body,
  );
}

/** Pure display of a SheetModel. Shared by /preview and the future public /@handle page. */
export function CharacterSheet({ model, scanlines = false, share }: CharacterSheetProps) {
  return (
    <div className={styles.root}>
      {scanlines && <Scanlines />}
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.headerGroup}>
            <div
              aria-hidden="true"
              style={{ fontFamily: FONT_PIXEL, fontSize: 26, lineHeight: 1, color: COLOR.gold, textShadow: `3px 3px 0 ${COLOR.purple},6px 6px 0 ${COLOR.ink}`, letterSpacing: 1 }}
            >
              DEV.QUEST
            </div>
            <h1 style={{ margin: 0, fontWeight: 400, border: `3px solid ${COLOR.border}`, background: COLOR.panel, padding: '8px 12px', fontSize: 15, color: COLOR.soft, boxShadow: `3px 3px 0 ${COLOR.ink}` }}>
              <span className="visually-hidden">DEV.QUEST · </span>
              {sourceTitle(model.sources)} <span style={{ color: COLOR.green }}>▸</span> 공개 프로필
            </h1>
          </div>
          <div className={styles.headerGroup}>
            {model.updatedAt && <div style={{ fontSize: 14, color: COLOR.muted }}>마지막 갱신 {model.updatedAt}</div>}
            <ShareButton share={share} />
          </div>
        </header>

        <div className={styles.main}>
          <CharacterPanel model={model} />
          <InventoryPanel shown={model.skills.shown} total={model.skills.total} />
          <div className={styles.areaSide}>
            <StatsPanel stats={model.stats} total={model.statTotal} />
            <PassivePanel passives={model.passives} />
          </div>
        </div>

        <PartyPanel members={model.party.members} total={model.party.total} />

        <footer className={styles.footer}>
          <span style={{ overflowWrap: 'anywhere' }}>
            dev.quest/@{model.handle}
            {model.updatedAt && ` · 마지막 갱신 ${model.updatedAt}`}
          </span>
          <span aria-hidden="true" style={{ fontFamily: FONT_PIXEL, fontSize: 9 }}>
            PRESS <span style={{ color: COLOR.gold }}>SHARE</span> TO CONTINUE<span style={{ animation: 'blink 1s steps(1) infinite' }}>_</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
