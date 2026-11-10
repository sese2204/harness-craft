// Browser entry of the shared HTML file (docs/share-spec.md). Bundled by scripts/build-share-template.mjs.
// Hiding items and blanking descriptions already happened in the CLI, so everything in the data is drawn.
import '@harness-craft/sheet-ui/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseProfile, toSheet, type HarnessProfile, type Visibility } from '@harness-craft/sheet';
import { CharacterSheet } from '@harness-craft/sheet-ui';

import { SHARE_DATA_ID, SHARE_ROOT_ID } from '../src/shareFormat.js';

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
        <CharacterSheet model={model} scanlines={false} share={null} />
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
