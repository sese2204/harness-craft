import type { Metadata } from 'next';

import { PreviewApp } from '@/components/preview/PreviewApp';

export const metadata: Metadata = {
  title: 'DEV.QUEST — 미리보기',
};

export default function PreviewPage() {
  return (
    <main className="page">
      <PreviewApp />
    </main>
  );
}
