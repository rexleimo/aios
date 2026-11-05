import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIOS 控制台',
  description: 'AIOS 的能力接入、记忆、用量与观测面',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-rex-theme="light">
      <body>{children}</body>
    </html>
  );
}
