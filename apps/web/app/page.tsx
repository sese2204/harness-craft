import type { ReactNode } from 'react';
import Link from 'next/link';
import type { IconName } from '@harness-craft/sheet';

import { PixelIcon } from '@/components/sheet/pixel';

import styles from './landing.module.css';

interface Step {
  icon: IconName;
  title: ReactNode;
  body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: 'key',
    title: (
      <>
        <code>npx harness-craft</code> 실행
      </>
    ),
    body: '내 PC 의 Claude Code·Codex 설정과 사용 기록을 읽어 harness-profile.json 한 파일을 만듭니다. 네트워크는 쓰지 않습니다.',
  },
  {
    icon: 'scroll',
    title: '파일 열기',
    body: '미리보기에서 파일을 고르거나 끌어다 놓습니다. 파일은 브라우저 안에서만 읽고 어디에도 보내지 않습니다.',
  },
  {
    icon: 'shield',
    title: '시트 확인',
    body: '장비·스킬·파티·스탯이 내 사용 기록대로 채워집니다. 공개 페이지와 공유는 곧 지원합니다.',
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <div className={styles.wrap}>
        <div className={styles.logo} aria-hidden="true">
          DEV.QUEST
        </div>
        <h1 className={styles.title}>내 하네스를 캐릭터 시트로</h1>
        <p className={styles.lead}>
          Claude Code·Codex 에 붙여 둔 MCP 는 장비로, 스킬은 인벤토리로, 훅은 패시브로, 서브에이전트는 파티로. 쓴 만큼 레벨이 오릅니다.
        </p>
        <ol className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.icon} className={styles.step}>
              <div className={styles.stepHead}>
                <span className={styles.stepNo}>STEP {i + 1}</span>
                <span className={styles.stepIcon}>
                  <PixelIcon name={step.icon} scale={4} />
                </span>
              </div>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/preview" className={styles.cta}>
          미리보기 열기 ▸
        </Link>
        <p className={styles.note}>
          파일 없이 열면 샘플 시트가 먼저 보입니다<span className={styles.blink} aria-hidden="true">_</span>
        </p>
      </div>
    </main>
  );
}
