'use client';

import { ChevronDown, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button } from '../console-ui';
import type { RoutingProvider } from '../model-routing/use-routing-config';

export function ModelSourceProviderDetail({ provider, onEdit, onRemove }: {
  provider: RoutingProvider;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const anonymous = provider.authMode === 'none';
  return (
    <header className="border-b border-rex-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all text-lg font-semibold tracking-tight">{provider.id}</h3>
            <Badge tone="neutral">{provider.enabled === false ? '已停用' : '配置启用'}</Badge>
          </div>
          <p className="mt-1.5 break-all font-rex-mono text-[11px] leading-5 text-rex-text-muted">{provider.baseUrl}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" aria-label={`编辑供应商 ${provider.id}`} onClick={onEdit}><Pencil size={14} /></Button>
          <Button size="icon" variant="ghost" aria-label={`移除供应商 ${provider.id}`} onClick={onRemove}><Trash2 size={14} /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] leading-5 text-rex-text-muted">
        <span>{provider.endpointStyle === 'standard' ? '标准 API' : 'Relay 前缀'}</span>
        <span className="inline-flex items-center gap-1"><KeyRound size={12} />{anonymous ? '无需认证' : '需要认证'}</span>
        <span>{provider.accounts?.length || 1} 个账号</span>
        <div className="flex flex-wrap gap-1">{provider.protocols.map((protocol) => <Badge key={protocol} tone="neutral">{protocol}</Badge>)}</div>
      </div>
      <details className="group mt-3 text-[11px] leading-5 text-rex-text-muted">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-rex-cyan">
          配置详情<ChevronDown size={12} className="group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2 border-l-2 border-rex-border pl-3">
          <p className="break-all">{anonymous ? '无需认证（不发送密钥）' : <>供应商回退引用：<span className="font-rex-mono">{provider.apiKeyEnv.trim() || '未配置（需要凭据）'}</span></>}</p>
          {provider.accounts?.length ? (
            <>
              <ul className="space-y-1" aria-label={`${provider.id} 账号有效密钥引用`}>
                {provider.accounts.map((account, index) => <li key={account.id} className="break-all">
                  {index + 1}. {account.id}：<span className="font-rex-mono">{anonymous ? '无需认证（不发送密钥）' : account.apiKeyEnv.trim() || provider.apiKeyEnv.trim() || '未配置（需要凭据）'}</span>
                  {!anonymous && !account.apiKeyEnv.trim() && '（继承供应商）'}
                </li>)}
              </ul>
              <p>账号按顺序重试；发现与分类使用首个账号。</p>
            </>
          ) : <p>默认账号使用供应商引用。</p>}
          <p>配置不代表凭据已验证。{provider.endpointStyle !== 'standard' && '旧配置未声明端点格式时保留 Relay 路径。'}</p>
        </div>
      </details>
    </header>
  );
}
