'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listEntries, parseProfile, toSheet, type HarnessProfile } from '@harness-craft/sheet';

import sampleJson from '@/data/sample-profile.json';
import { CharacterSheet } from '@/components/sheet/CharacterSheet';

import { FileOpener } from './FileOpener';
import styles from './preview.module.css';
import { readProfileFile } from './readProfileFile';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type PreviewSettings } from './settings';
import { VisibilityPanel } from './VisibilityPanel';

function loadSample(): HarnessProfile {
  const result = parseProfile(sampleJson);
  if (!result.ok) throw new Error(`샘플 프로필이 스키마와 맞지 않습니다: ${result.errors.join(', ')}`);
  return result.profile;
}

const SAMPLE_PROFILE = loadSample();

interface LoadedProfile {
  profile: HarnessProfile;
  fileName: string | null;
}

export function PreviewApp() {
  const [settings, setSettings] = useState<PreviewSettings>(DEFAULT_SETTINGS);
  const [isRestored, setIsRestored] = useState(false);
  const [loaded, setLoaded] = useState<LoadedProfile>({ profile: SAMPLE_PROFILE, fileName: null });
  const [errors, setErrors] = useState<string[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // localStorage is only readable after hydration; restore once, then persist every change.
  useEffect(() => {
    setSettings(loadSettings());
    setIsRestored(true);
  }, []);
  useEffect(() => {
    if (isRestored) saveSettings(settings);
  }, [settings, isRestored]);

  const entries = useMemo(() => listEntries(loaded.profile), [loaded.profile]);
  const model = useMemo(
    () => toSheet(loaded.profile, { handle: settings.handle, showDescriptions: settings.showDescriptions, hidden: settings.hidden }),
    [loaded.profile, settings.handle, settings.showDescriptions, settings.hidden],
  );

  const handleFile = async (file: File) => {
    setIsBusy(true);
    try {
      const result = await readProfileFile(file);
      if (result.ok) {
        setLoaded({ profile: result.profile, fileName: file.name });
        setErrors(null);
      } else {
        setErrors(result.errors);
      }
    } catch (error: unknown) {
      console.error('[harness-craft] 프로필 파일을 읽지 못했습니다.', error);
      setErrors([error instanceof Error ? error.message : '파일을 읽지 못했습니다.']);
    } finally {
      setIsBusy(false);
    }
  };

  const isSample = loaded.fileName === null;

  return (
    <div className={styles.layout}>
      <aside className={styles.panel} aria-label="공개 설정">
        <div className={styles.panelHead}>
          <Link href="/" className={styles.logo}>
            DEV.QUEST
          </Link>
          <h2 className={styles.panelTitle}>미리보기 · 공개 설정</h2>
        </div>
        <FileOpener fileName={loaded.fileName} isBusy={isBusy} onFile={handleFile} onReset={() => setLoaded({ profile: SAMPLE_PROFILE, fileName: null })} />
        {errors && (
          <div role="alert" className={styles.error}>
            <p className={styles.errorTitle}>이 파일로는 시트를 그릴 수 없습니다.</p>
            <p className={styles.errorHint}>
              <code>npx harness-craft</code> 가 만든 <code>harness-profile.json</code> 인지 확인해 주세요.
            </p>
            <ul className={styles.errorList}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <VisibilityPanel settings={settings} entries={entries} onChange={setSettings} />
      </aside>
      <div className={styles.sheetColumn}>
        {isSample && (
          <p className={styles.sampleBanner}>
            <span className={styles.sampleBadge}>샘플</span> 가상의 하네스로 그린 예시입니다. 파일을 열면 내 하네스로 바뀝니다.
          </p>
        )}
        <CharacterSheet model={model} scanlines={settings.scanlines} />
      </div>
    </div>
  );
}
