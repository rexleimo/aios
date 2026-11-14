'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from './console-ui';

interface Provider {
  id: string;
  baseUrl: string;
  apiKeyEnv: string;
  protocols: string[];
  models: string[];
}
interface Editable {
  providers: Provider[];
  matrix: { default: Record<string, string>; clients: Record<string, Record<string, string>> };
}

const ROLES = ['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member'];
const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  implementer: '实现',
  reviewer: '审查',
  'security-reviewer': '安全审查',
  'team-lead': '团队负责',
  'team-member': '团队成员',
};

type Status = 'loading' | 'ready' | 'error' | 'saving';

export function ModelRoutingPanel() {
  const [editable, setEditable] = useState<Editable | null>(null);
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [clientId, setClientId] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/config/model-routing');
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || '读取失败');
      setEditable(body.editable);
      setHash(body.hash);
      setStatus('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!editable) return;
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/config/model-routing', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editable, expectedHash: hash }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || '保存失败');
      setHash(body.hash || hash);
      setMessage(body.changed?.length ? `已保存：${body.changed.join(', ')}` : '无变更');
      setStatus('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('ready');
    }
  }, [editable, hash]);

  const setDefaultModel = (role: string, model: string) => {
    setEditable((prev) => prev ? { ...prev, matrix: { ...prev.matrix, default: { ...prev.matrix.default, [role]: model } } } : prev);
  };

  const setClientModel = (client: string, role: string, model: string) => {
    setEditable((prev) => {
      if (!prev) return prev;
      const clientMap = { ...(prev.matrix.clients[client] || {}), [role]: model };
      return { ...prev, matrix: { ...prev.matrix, clients: { ...prev.matrix.clients, [client]: clientMap } } };
    });
  };

  if (status === 'loading') {
    return <Panel className="max-w-3xl p-6 text-sm text-rex-text-muted">正在读取模型路由配置…</Panel>;
  }
  if (status === 'error' || !editable) {
    return (
      <Panel className="max-w-3xl p-6">
        <p className="text-sm text-rex-text-muted">没读到模型路由配置：{message || '未知原因'}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>重试</Button>
      </Panel>
    );
  }

  return (
    <Panel className="max-w-3xl p-6">
      <h3 className="mb-2 text-xs font-semibold text-rex-text-muted">供应商</h3>
      {editable.providers.length === 0 ? (
        <p className="mb-5 text-xs text-rex-text-muted">还没有自定义供应商（默认走内置 relay）。</p>
      ) : (
        <div className="mb-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-rex-border text-left text-rex-text-muted">
                <th className="py-2 pr-3 font-medium">供应商</th>
                <th className="py-2 pr-3 font-medium">端点</th>
                <th className="py-2 pr-3 font-medium">协议</th>
                <th className="py-2 font-medium">密钥引用</th>
              </tr>
            </thead>
            <tbody>
              {editable.providers.map((provider) => (
                <tr key={provider.id} className="border-b border-rex-border/60">
                  <td className="py-2 pr-3 font-medium">{provider.id}</td>
                  <td className="py-2 pr-3 text-rex-text-muted">{provider.baseUrl}</td>
                  <td className="py-2 pr-3 text-rex-text-muted">{provider.protocols.join(', ') || '—'}</td>
                  <td className="py-2 text-rex-text-muted">{provider.apiKeyEnv || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold text-rex-text-muted">角色 → 模型（全局默认）</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-rex-text-muted">{ROLE_LABEL[role]}</span>
            <input
              value={editable.matrix.default[role] || ''}
              onChange={(event) => setDefaultModel(role, event.target.value)}
              placeholder="模型 id"
              className="w-full rounded-lg border border-rex-border bg-rex-bg px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-rex-cyan"
            />
          </label>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold text-rex-text-muted">每客户端覆盖（优先于全局默认）</h3>
      <label className="mb-2 flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-rex-text-muted">客户端 id</span>
        <input
          value={clientId}
          onChange={(event) => setClientId(event.target.value.trim())}
          placeholder="如 claude / codex / opencode"
          className="w-full rounded-lg border border-rex-border bg-rex-bg px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-rex-cyan"
        />
      </label>
      {clientId ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-rex-text-muted">{ROLE_LABEL[role]}</span>
              <input
                value={editable.matrix.clients[clientId]?.[role] || ''}
                onChange={(event) => setClientModel(clientId, role, event.target.value)}
                placeholder="留空＝用全局默认"
                className="w-full rounded-lg border border-rex-border bg-rex-bg px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-rex-cyan"
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-rex-text-muted">填一个客户端 id 即可为它单独配置角色模型。</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中…' : '保存路由配置'}
        </Button>
        {message && <span className="text-xs text-rex-text-muted">{message}</span>}
      </div>
    </Panel>
  );
}