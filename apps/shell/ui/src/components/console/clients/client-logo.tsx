'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';

// 统一的客户端品牌 logo：所有客户端一律用 public/icons 下的现有 logo，不用文字/monogram。
// 品牌图标来自 magpie（MIT），见 public/icons/NOTICE.md；zcode 是 png，其余是 svg。
// 没有对应 logo 文件或加载失败时，用通用图标占位（不是首字母——用户要求不用文字 logo）。
const ICON_EXT: Record<string, string> = { zcode: 'png' };

export function ClientLogo({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'lg' ? 'size-12' : size === 'sm' ? 'size-8' : 'size-10';
  const img = size === 'lg' ? 'size-9' : size === 'sm' ? 'size-6' : 'size-7';
  const src = `/icons/${id}.${ICON_EXT[id] || 'svg'}`;
  return (
    <span aria-hidden="true" className={`grid ${box} shrink-0 place-items-center rounded-rex-md border border-rex-border bg-rex-panel`}>
      {failed ? <Bot size={16} className="text-rex-text-muted" /> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={`${img} object-contain`} onError={() => setFailed(true)} />
      )}
    </span>
  );
}
