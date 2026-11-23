'use client';

import { t } from '../../../../i18n/t.mjs';
import { Field, Input, Select } from '../../console-ui';
import type { RoutingProvider } from '../../model-routing/use-routing-config';
import { API_CHOICES, connectionUrls, primaryProtocol, selectPreset, updateConnection } from './connections.mjs';
import { PROVIDER_PRESETS } from './presets.mjs';
import type { RefObject } from 'react';

export function ProviderConnectionFields({ provider, onChange, initialFocus }: {
  provider: RoutingProvider;
  onChange: (next: RoutingProvider) => void;
  initialFocus?: RefObject<HTMLInputElement | null>;
}) {
  const preset = PROVIDER_PRESETS.find(item => item.id === provider.preset) || PROVIDER_PRESETS[0];
  const primary = primaryProtocol(provider);
  const urls = connectionUrls(provider);
  const selected = API_CHOICES.find(item => item.value === primary)!;
  return <>
    <Field label={t("供应商")} hint={preset.hint || t("预设只填写连接地址，不会读取密钥、发起请求或验证模型。")}>
      <Select aria-label={t("供应商预设")} value={preset.id} options={PROVIDER_PRESETS.map(item => ({ value: item.id, label: item.name }))}
        onValueChange={id => onChange(selectPreset(provider, id))} />
    </Field>
    {preset.regions && <Field label={t("地区或套餐")} hint={t("请按账号与密钥所属地区或套餐选择；不同选项的凭据不一定通用。")}>
      <Select aria-label={t("地区或套餐")} value={provider.presetRegion || preset.regions[0].id} options={preset.regions.map(item => ({ value: item.id, label: item.name }))}
        onValueChange={id => onChange(selectPreset(provider, preset.id, id))} />
    </Field>}
    <Field label={t("主要 API")} hint={t("这是填写下方 Base URL 所用的 API 格式。其他格式可单独配置，不会因勾选而假定渠道支持。")}>
      <Select aria-label={t("主要 API")} value={primary} options={API_CHOICES}
        onValueChange={baseProtocol => onChange({ ...provider, protocolBaseUrls: urls, baseProtocol, baseUrl: urls[baseProtocol] || '' })} />
    </Field>
    <Field label="API Base URL" hint={t("{value0} 的地址。保留渠道文档给出的版本与路径前缀；不要附带密钥或查询参数。", { value0: selected.label })}>
      <Input ref={initialFocus} aria-label={t("API 端点")} value={urls[primary] || ''} placeholder={primary === 'claude' ? 'https://api.example.com/anthropic' : 'https://api.example.com/v1'}
        onChange={event => onChange(updateConnection(provider, primary, event.target.value))} />
    </Field>
    <details className="rounded-rex-sm border border-rex-border p-3">
      <summary className="cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan">{t("其他 API 地址")}</summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs leading-5 text-rex-text-muted">{t("只填写渠道实际支持的 API，留空表示不提供。可以是不同域名或路径；不会从主要地址猜测。")}</p>
        {API_CHOICES.filter(item => item.value !== primary).map(item => <Field key={item.value} label={item.label} hint={t("API Base URL；生成请求使用 {value0}。", { value0: item.suffix })}>
          <Input aria-label={t("{value0} 地址", { value0: item.label })} value={urls[item.value] || ''} placeholder={t("未配置此 API")}
            onChange={event => onChange(updateConnection(provider, item.value, event.target.value))} />
        </Field>)}
      </div>
    </details>
    {!!urls.claude && <Field label={t("Anthropic 密钥请求头")} hint={t("第三方渠道可能只接受其中一种。官方 Anthropic 使用 x-api-key。发现模型、分类和转发使用同一设置。")}>
      <Select aria-label={t("Anthropic 密钥请求头")} value={provider.authHeader || 'x-api-key'}
        options={[{ value: 'x-api-key', label: 'x-api-key' }, { value: 'bearer', label: 'Authorization: Bearer' }, { value: 'both', label: t("两种请求头") }]}
        onValueChange={authHeader => onChange({ ...provider, authHeader: authHeader as RoutingProvider['authHeader'] })} />
    </Field>}
  </>;
}
