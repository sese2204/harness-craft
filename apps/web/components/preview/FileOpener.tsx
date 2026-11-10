'use client';

import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

import styles from './preview.module.css';

interface Props {
  fileName: string | null;
  isBusy: boolean;
  onFile: (file: File) => void;
  onReset: () => void;
}

export function FileOpener({ fileName, isBusy, onFile, onReset }: Props) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <p className={styles.dropText}>
        <code>harness-profile.json</code> 을 여기에 끌어다 놓거나
      </p>
      <label htmlFor={inputId} className={styles.fileButton}>
        {isBusy ? '읽는 중…' : '파일 선택'}
      </label>
      <input id={inputId} type="file" accept=".json,application/json" className="visually-hidden" onChange={handleChange} />
      <p className={styles.status} aria-live="polite">
        {fileName ? (
          <>
            열린 파일: <strong>{fileName}</strong>{' '}
            <button type="button" className={styles.linkButton} onClick={onReset}>
              샘플로 되돌리기
            </button>
          </>
        ) : (
          '지금은 샘플을 보여 주고 있습니다.'
        )}
      </p>
      <p className={styles.privacy}>파일은 이 브라우저 밖으로 나가지 않습니다.</p>
    </div>
  );
}
