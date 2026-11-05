import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIOS 接入矩阵',
  description: 'AIOS 在每个客户端上的能力声明与证据状态',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
  <html lang="zh-CN" data-rex-theme="light">
  <body>{children}</body>
  </html>
  );
}