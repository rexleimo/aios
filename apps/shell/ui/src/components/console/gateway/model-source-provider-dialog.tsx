'use client';

import { useRef, useState } from 'react';
import { Button, Field, InlineFeedback, Input, Modal, Select, type Feedback } from '../console-ui';
import type { RoutingProvider } from '../model-routing/use-routing-config';
import { ModelSourceProtocols } from './model-source-protocols';

const EMPTY_PROVIDER: RoutingProvider = {
  id: '',
  baseUrl: '',
  apiKeyEnv: '',
  authMode: 'required',
  endpointStyle: 'standard',
  protocols: ['openai-chat'],
  models: [],
};

export function ModelSourceProviderDialog({
  initialValue,
  providers,
  onSubmit,
  onClose,
}: {
  initialValue?: RoutingProvider;
  providers: RoutingProvider[];
  onSubmit: (next: RoutingProvider) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState(() => structuredClone(initialValue ?? EMPTY_PROVIDER));
  const [error, setError] = useState<Feedback | null>(null);
  const [endpointConfirmed, setEndpointConfirmed] = useState(false);
  const initialFocus = useRef<HTMLInputElement>(null);
  const editingId = initialValue?.id || '';
  const accounts = provider.accounts ?? [];
  const effectiveRefs = accounts.length
    ? accounts.map((account) => account.apiKeyEnv.trim() || provider.apiKeyEnv.trim())
    : [provider.apiKeyEnv.trim()];
  const endpointChanged = Boolean(initialValue) && (provider.baseUrl.trim().replace(/\/+$/, '') !== initialValue?.baseUrl.trim().replace(/\/+$/, '')
    || (provider.endpointStyle || 'relay') !== (initialValue?.endpointStyle || 'relay'));
  const endpointNeedsConfirmation = provider.authMode !== 'none' && endpointChanged && effectiveRefs.some(Boolean);

  function updateAccount(index: number, patch: Partial<NonNullable<RoutingProvider['accounts']>[number]>) {
    setProvider({ ...provider, accounts: accounts.map((account, i) => i === index ? { ...account, ...patch } : account) });
    setEndpointConfirmed(false);
  }

  function moveAccount(index: number, direction: number) {
    const next = [...accounts];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setProvider({ ...provider, accounts: next });
    setEndpointConfirmed(false);
  }

  function submit() {
    const next = {
      ...provider,
      id: provider.id.trim().toLowerCase(),
      baseUrl: provider.baseUrl.trim(),
      apiKeyEnv: provider.apiKeyEnv.trim(),
      ...(provider.accounts !== undefined ? { accounts: accounts.map((account) => ({
        ...account, id: account.id.trim().toLowerCase(), apiKeyEnv: account.apiKeyEnv.trim(),
      })) } : {}),
    };
    let message = '';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(next.id))
      message = '供应商标识只能使用字母、数字、点、下划线和短横线。';
    else if (!editingId && providers.some((item) => item.id.trim().toLowerCase() === next.id))
      message = '这个供应商标识已经存在。';
    else {
      try {
        const url = new URL(next.baseUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
          message = '请输入不含账号密码的 HTTP(S) 地址。';
      } catch {
        message = '请输入有效的 HTTP(S) 地址。';
      }
    }
    if (!message && next.apiKeyEnv && !/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(next.apiKeyEnv))
      message = '密钥只能填写 env:VARIABLE 引用，不能填写真实密钥。';
    const accountIds = new Set<string>();
    for (const account of next.accounts ?? []) {
      if (!message && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(account.id))
        message = '账号标识只能使用字母、数字、点、下划线和短横线，不能为空。';
      if (!message && accountIds.has(account.id)) message = '账号标识不能重复。';
      accountIds.add(account.id);
      if (!message && account.apiKeyEnv && !/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(account.apiKeyEnv))
        message = '账号密钥只能填写 env:VARIABLE 引用，不能填写真实密钥。';
    }
    if (!message && !next.protocols.length) message = '至少选择一种协议。';
    if (!message && endpointNeedsConfirmation && !endpointConfirmed)
      message = '请确认所有账号的有效密钥引用都可以发送到新的 API 端点。';
    if (message) {
      setError({ text: message, tone: 'error' });
      return;
    }
    onSubmit(next);
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editingId ? '编辑供应商' : '添加供应商'}
      description="配置连接和认证，再为这个供应商添加模型。加入草稿后，需保存全部修改才会写入配置。"
      wide
      initialFocus={initialFocus}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-5"
      >
        <section className="space-y-4" aria-label="供应商连接">
          <h3 className="text-xs font-semibold text-rex-text-muted">连接设置</h3>
          <Field label="供应商标识" hint={editingId ? '稳定引用，已有模型通过此标识归属供应商。' : undefined}>
            <Input
              ref={editingId ? undefined : initialFocus}
              aria-label="供应商标识"
              disabled={!!editingId}
              value={provider.id}
              placeholder="例如 my-provider"
              onChange={(event) => setProvider({ ...provider, id: event.target.value })}
            />
          </Field>
          <Field label="API 端点">
            <Input
              ref={editingId ? initialFocus : undefined}
              aria-label="API 端点"
              value={provider.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => {
                setProvider({ ...provider, baseUrl: event.target.value });
                setEndpointConfirmed(false);
              }}
            />
          </Field>
          <Field label="端点路径格式" hint="直连选择标准 API，可带 /v1。旧配置未声明时保留 Relay 路径，不会自动切换。">
            <Select
              aria-label="供应商端点路径格式"
              value={provider.endpointStyle || 'relay'}
              onValueChange={(endpointStyle) => {
                setProvider({ ...provider, endpointStyle: endpointStyle as 'standard' | 'relay' });
                setEndpointConfirmed(false);
              }}
              options={[{ value: 'standard', label: '标准 API（直连供应商 / 本地服务）' }, { value: 'relay', label: 'Relay 前缀（旧配置默认）' }]}
            />
          </Field>
          <ModelSourceProtocols
            value={provider.protocols}
            available={initialValue?.protocols}
            onChange={(protocols) => setProvider({ ...provider, protocols })}
          />
        </section>
        <section className="space-y-4 border-t border-rex-border pt-5" aria-label="供应商认证">
          <h3 className="text-xs font-semibold text-rex-text-muted">认证与账号</h3>
          <Field label="认证方式" hint="只有明确无需认证的本地或自托管端点才选择无需认证；留空密钥不等于无需认证。">
            <Select
              aria-label="供应商认证方式"
              value={provider.authMode || 'required'}
              onValueChange={(authMode) => {
                setProvider({ ...provider, authMode: authMode as 'required' | 'none' });
                setEndpointConfirmed(false);
              }}
              options={[{ value: 'required', label: '需要认证（默认）' }, { value: 'none', label: '无需认证（本地 / 自托管）' }]}
            />
          </Field>
          {provider.authMode === 'none' && <p className="text-xs leading-5 text-rex-text-muted">已显式声明无需认证，不会发送密钥。已有环境变量引用会保留，切回需要认证后才使用。</p>}
          <Field
            label="密钥环境变量引用"
            hint="仅填写 env:MY_API_KEY，不要粘贴真实密钥。账号有独立引用时，不受此项修改影响。"
          >
            <Input
              aria-label="密钥环境变量引用"
              value={provider.apiKeyEnv}
              placeholder="env:MY_API_KEY"
              onChange={(event) => {
                setProvider({ ...provider, apiKeyEnv: event.target.value });
                setEndpointConfirmed(false);
              }}
            />
          </Field>
          <details open={accounts.length > 0} className="rounded-rex-sm border border-rex-border p-3">
            <summary className="cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-2 focus-visible:outline-rex-cyan">多账号与重试{accounts.length ? ` · ${accounts.length} 个账号` : ' · 可选'}</summary>
            <section aria-label="供应商账号" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">账号与有效密钥</h3>
                <Button type="button" variant="outline" onClick={() => {
                  let id = `account-${accounts.length + 1}`;
                  while (accounts.some((account) => account.id === id)) id += '-new';
                  setProvider({ ...provider, accounts: [...accounts, { id, apiKeyEnv: '' }] });
                  setEndpointConfirmed(false);
                }}>添加账号</Button>
              </div>
              <p className="text-xs leading-5 text-rex-text-muted">
                运行时优先使用账号自己的引用；账号引用留空才继承供应商引用。账号环境变量未设置时不会回退到供应商引用。
                网关按列表顺序尝试账号，可重试的失败会切换到下一账号；发现模型和意图分类使用首个账号。
              </p>
              {accounts.length === 0 && <p className="break-all text-xs leading-5 text-rex-text-muted">
                默认账号有效引用：{provider.authMode === 'none' ? '无需认证（不发送密钥）' : provider.apiKeyEnv.trim() || '未配置（需要凭据）'}
              </p>}
              {accounts.map((account, index) => (
                <div key={index} className="space-y-3 rounded-rex-sm border border-rex-border p-3">
                  <Field label={`账号 ${index + 1} 标识`} hint={initialValue?.accounts?.some((item) => item.id === account.id) ? '已有账号标识保持不变，保留其扩展元数据。' : undefined}>
                    <Input
                      aria-label={`账号 ${index + 1} 标识`}
                      value={account.id}
                      disabled={initialValue?.accounts?.some((item) => item.id === account.id)}
                      onChange={(event) => updateAccount(index, { id: event.target.value })}
                    />
                  </Field>
                  <Field label={`账号 ${index + 1} 密钥环境变量引用`} hint="留空继承供应商引用，不会读取其他账号的引用。">
                    <Input
                      aria-label={`账号 ${index + 1} 密钥环境变量引用`}
                      value={account.apiKeyEnv}
                      placeholder="env:ACCOUNT_API_KEY"
                      onChange={(event) => updateAccount(index, { apiKeyEnv: event.target.value })}
                    />
                  </Field>
                  <p className="break-all text-xs leading-5 text-rex-text-muted">
                    有效引用：{provider.authMode === 'none' ? '无需认证（不发送密钥）' : effectiveRefs[index] || '未配置（需要凭据）'}{provider.authMode !== 'none' && !account.apiKeyEnv.trim() && '（继承供应商）'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={index === 0} aria-label={`上移账号 ${index + 1}`} onClick={() => moveAccount(index, -1)}>上移</Button>
                    <Button type="button" variant="outline" disabled={index === accounts.length - 1} aria-label={`下移账号 ${index + 1}`} onClick={() => moveAccount(index, 1)}>下移</Button>
                    <Button type="button" variant="outline" aria-label={`移除账号 ${index + 1}`} onClick={() => {
                      setProvider({ ...provider, accounts: accounts.filter((_, i) => i !== index) });
                      setEndpointConfirmed(false);
                    }}>移除账号</Button>
                  </div>
                </div>
              ))}
            </section>
          </details>
        </section>
        {endpointNeedsConfirmation && <div className="space-y-2 rounded-rex-sm border border-rex-border bg-rex-panel p-3 text-xs leading-5">
          <p>API 端点已变更。保存后，下列有效引用解析出的密钥将发送到新端点（包括重试账号）；请核对端点归属及每个账号的授权范围。</p>
          <p className="break-all">有效引用：{effectiveRefs.filter(Boolean).join('、')}</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 accent-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan" checked={endpointConfirmed} onChange={(event) => setEndpointConfirmed(event.target.checked)} />
            我确认这些账号密钥可以用于新的 API 端点
          </label>
        </div>}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan" checked={provider.enabled !== false} onChange={(event) => setProvider({ ...provider, enabled: event.target.checked })} />
          启用此供应商
        </label>
        <InlineFeedback feedback={error} />
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-rex-border bg-rex-bg pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">加入草稿</Button>
        </div>
      </form>
    </Modal>
  );
}
