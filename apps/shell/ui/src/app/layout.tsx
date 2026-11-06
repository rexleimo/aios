import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIOS 控制台',
  description: '本机 AI 工具管理、项目记忆与 MCP 服务工作空间',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-rex-theme="light">
      <body>{children}</body>
    </html>
  );
}
