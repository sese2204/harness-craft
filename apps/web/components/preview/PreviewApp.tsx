'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { parseProfile, toSheet, type HarnessProfile, type Visibility } from '@harness-craft/sheet';

import sampleJson from '@/data/sample-profile.json';
import { CharacterSheet } from '@harness-craft/sheet-ui';

import { FileOpener } from './FileOpener';
import styles from './preview.module.css';
import { readProfileFile } from './readProfileFile';

function loadSample(): HarnessProfile {
  const result = parseProfile(sampleJson);
  if (!result.ok) throw new Error(`샘플 프로필이 스키마와 맞지 않습니다: ${result.errors.join(', ')}`);
  return result.profile;
}

const SAMPLE_PROFILE = loadSample();

// 공개 설정 패널을 뺐으므로 미리보기는 늘 같은 설정으로 그린다. 항목별 숨김은 공개(업로드) 단계에서 다시 다룬다.
const VISIBILITY: Visibility = {
  handle: 'player',
  showDescriptions: false,
  hidden: { mcp: [], skills: [], agents: [], hooks: [] },
};

interface LoadedProfile {
  profile: HarnessProfile;
  fileName: string | null;
}

export function PreviewApp() {
  const [loaded, setLoaded] = useState<LoadedProfile>({ profile: SAMPLE_PROFILE, fileName: null });
  const [errors, setErrors] = useState<string[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const model = useMemo(() => toSheet(loaded.profile, VISIBILITY), [loaded.profile]);

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

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div
      className={`${styles.page} ${isDragging ? styles.pageDragging : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <FileOpener
        fileName={loaded.fileName}
        isBusy={isBusy}
        onFile={(file) => void handleFile(file)}
        onReset={() => setLoaded({ profile: SAMPLE_PROFILE, fileName: null })}
      />
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
      <CharacterSheet model={model} scanlines={false} />
    </div>
  );
}
