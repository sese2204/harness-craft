// Browser entry of the shared HTML file (docs/share-spec.md). Bundled by scripts/build-share-template.mjs.
// Hiding items and blanking descriptions already happened in the CLI, so everything in the data is drawn.
import '@harness-craft/sheet-ui/base.css';

import { StrictMode, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseProfile, toSheet, type HarnessProfile, type Visibility } from '@harness-craft/sheet';
import { CharacterSheet } from '@harness-craft/sheet-ui';

import { SHARE_DATA_ID, SHARE_ROOT_ID } from '../src/shareFormat.js';

/** The sheet is laid out at this width (3 columns) and scaled to the window, so it reads as one screen. */
const DESIGN_WIDTH = 1440;
/** Below this window width the sheet keeps its own stacked mobile layout instead of shrinking. */
const FIT_MIN_VIEWPORT = 600;
/** Fitting the height too would make text smaller than this scale; then only the width is fitted and the page scrolls. */
const MIN_HEIGHT_FIT_SCALE = 0.55;

function FitToScreen({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(() => document.documentElement.clientWidth >= FIT_MIN_VIEWPORT);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const update = () => {
      const vw = document.documentElement.clientWidth;
      const nextFit = vw >= FIT_MIN_VIEWPORT;
      setFit(nextFit);
      document.body.classList.toggle('fit', nextFit);
      const el = inner.current;
      if (!nextFit || !el) return;
      const height = el.offsetHeight;
      const byWidth = Math.min(1, vw / DESIGN_WIDTH);
      const byBoth = Math.min(byWidth, window.innerHeight / height);
      setBox({ scale: byBoth >= MIN_HEIGHT_FIT_SCALE ? byBoth : byWidth, height });
    };
    update();
    const observer = new ResizeObserver(update);
    if (inner.current) observer.observe(inner.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fit]);

  if (!fit) return <>{children}</>;
  return (
    <div style={{ width: DESIGN_WIDTH * box.scale, height: box.height * box.scale, margin: '0 auto', overflow: 'hidden' }}>
      <div ref={inner} style={{ width: DESIGN_WIDTH, padding: '24px 28px', boxSizing: 'border-box', transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

const NOTHING_HIDDEN: Visibility['hidden'] = { mcp: [], skills: [], agents: [], hooks: [] };

interface LoadedShare {
  handle: string;
  profile: HarnessProfile;
}

function readShareData(): LoadedShare {
  const text = document.getElementById(SHARE_DATA_ID)?.textContent;
  if (!text) throw new Error('시트 데이터가 없습니다.');
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null) throw new Error('시트 데이터 형식이 맞지 않습니다.');
  const { handle, profile } = data as { handle?: unknown; profile?: unknown };
  if (typeof handle !== 'string') throw new Error('handle 이 문자열이 아닙니다.');
  const parsed = parseProfile(profile);
  if (!parsed.ok) throw new Error(`프로필이 스키마와 맞지 않습니다: ${parsed.errors.join(', ')}`);
  return { handle, profile: parsed.profile };
}

function render(container: HTMLElement): void {
  try {
    const { handle, profile } = readShareData();
    const model = toSheet(profile, { handle, showDescriptions: true, hidden: NOTHING_HIDDEN });
    document.title = `@${model.handle} · DEV.QUEST`;
    createRoot(container).render(
      <StrictMode>
        <FitToScreen>
          <CharacterSheet model={model} scanlines={false} share={null} />
        </FitToScreen>
      </StrictMode>,
    );
  } catch (error: unknown) {
    console.error('[harness-craft] 공유 시트를 그리지 못했습니다.', error);
    container.textContent = `시트를 그리지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const container = document.getElementById(SHARE_ROOT_ID);
if (!container) throw new Error(`#${SHARE_ROOT_ID} 가 없습니다.`);
render(container);
