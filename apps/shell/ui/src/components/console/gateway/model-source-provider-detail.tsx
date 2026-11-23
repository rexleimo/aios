'use client';

import { t } from '../../../i18n/t.mjs';
import { ChevronDown, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button } from '../console-ui';
import type { RoutingProvider } from '../model-routing/use-routing-config';
import { API_CHOICES, connectionUrls } from './provider/connections.mjs';
import { credentialLabel, effectiveCredential } from './provider/credential.mjs';
import { PROVIDER_PRESETS } from './provider/presets.mjs';

export function ModelSourceProviderDetail({ provider, onEdit, onRemove }: {
  provider: RoutingProvider;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const anonymous = provider.authMode === 'none';
  const urls = connectionUrls(provider);
  const preset = PROVIDER_PRESETS.find(item => item.id === provider.preset);
  return (
    <header className="border-b border-rex-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all text-lg font-semibold tracking-tight">{provider.id}</h3>
            <Badge tone="neutral">{provider.enabled === false ? t("已停用") : t("配置启用")}</Badge>
          </div>
          <p className="mt-1.5 break-all font-rex-mono text-[11px] leading-5 text-rex-text-muted">{provider.baseUrl}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" aria-label={t("编辑供应商 {value0}", { value0: provider.id })} onClick={onEdit}><Pencil size={14} /></Button>
          <Button size="icon" variant="ghost" aria-label={t("移除供应商 {value0}", { value0: provider.id })} onClick={onRemove}><Trash2 size={14} /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] leading-5 text-rex-text-muted">
        <span>{preset?.name || t("自定义渠道")}</span>
        <span className="inline-flex items-center gap-1"><KeyRound size={12} />{anonymous ? t("无需认证") : t("需要认证")}</span>
        <span>{provider.accounts?.length || 1}  {t("个账号")}</span>
        <div className="flex flex-wrap gap-1">{Object.keys(urls).map(protocol => <Badge key={protocol} tone="neutral">{API_CHOICES.find(item => item.value === protocol)?.label || protocol}</Badge>)}</div>
      </div>
      <details className="group mt-3 text-[11px] leading-5 text-rex-text-muted">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-rex-cyan">
          
          {t("配置详情")}<ChevronDown size={12} className="group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2 border-l-2 border-rex-border pl-3">
          <ul className="space-y-1" aria-label={t("{value0} API 地址", { value0: provider.id })}>{Object.entries(urls).map(([protocol, url]) => <li key={protocol} className="break-all">
            {API_CHOICES.find(item => item.value === protocol)?.label || protocol}：<span className="font-rex-mono">{url}</span>
          </li>)}</ul>
          <p className="break-all">{anonymous ? t("无需认证（不发送密钥）") : <>{t("供应商回退凭据：")}<span className="font-rex-mono">{credentialLabel(effectiveCredential(provider)) || t("未配置（需要凭据）")}</span></>}</p>
          {provider.accounts?.length ? (
            <>
              <ul className="space-y-1" aria-label={t("{value0} 账号有效密钥引用", { value0: provider.id })}>
                {provider.accounts.map((account, index) => <li key={account.id} className="break-all">
                  {index + 1}. {account.id}：<span className="font-rex-mono">{anonymous ? t("无需认证（不发送密钥）") : credentialLabel(effectiveCredential(provider, account)) || t("未配置（需要凭据）")}</span>
                  {!anonymous && !account.apiKey?.trim() && !account.apiKeyEnv.trim() && t("（继承供应商）")}
                </li>)}
              </ul>
              <p>{t("账号按顺序重试；发现与分类使用首个账号。")}</p>
            </>
          ) : <p>{t("默认账号使用供应商引用。")}</p>}
          <p>{t("配置不代表凭据已验证。已有连接在显式修改前保持原样。")}</p>
        </div>
      </details>
    </header>
  );
}
