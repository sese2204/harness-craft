'use client';

import { useId, type ChangeEvent } from 'react';

import styles from './preview.module.css';

interface Props {
  fileName: string | null;
  isBusy: boolean;
  onFile: (file: File) => void;
  onReset: () => void;
}

/** 시트 위 한 줄짜리 막대. 파일은 이 버튼으로 고르거나 화면 아무 곳에 끌어다 놓는다. */
export function FileOpener({ fileName, isBusy, onFile, onReset }: Props) {
  const inputId = useId();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  return (
    <div className={styles.toolbar}>
      <label htmlFor={inputId} className={styles.fileButton}>
        {isBusy ? '읽는 중…' : '파일 열기'}
      </label>
      <input id={inputId} type="file" accept=".json,application/json" className="visually-hidden" onChange={handleChange} />
      <p className={styles.status} aria-live="polite">
        {fileName ? (
          <>
            <strong>{fileName}</strong>{' '}
            <button type="button" className={styles.linkButton} onClick={onReset}>
              샘플로 되돌리기
            </button>
          </>
        ) : (
          <>
            <span className={styles.sampleBadge}>샘플</span> <code>harness-profile.json</code> 을 열거나 끌어다 놓으면 내 시트로 바뀝니다
          </>
        )}
      </p>
      <p className={styles.privacy}>파일은 브라우저 밖으로 나가지 않습니다</p>
    </div>
  );
}
