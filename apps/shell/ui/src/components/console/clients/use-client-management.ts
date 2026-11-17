'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientFailure, clientTargetOptions } from './client-management-model.mjs';

export interface ClientInstallation {
  id: string;
  installed: boolean | null;
  version?: string | null;
  versionStatus?: string;
  source?: string | { kind?: string; label?: string };
  revision: string;
  executable?: { path: string; realPath: string } | null;
  update?: { supported: boolean; reason?: string };
}
export interface ClientConnection {
  client: string;
  connected: boolean;
  target?: string | null;
  defaultTarget?: string | null;
  mode?: string;
  launch?: string;
  readback?: { status?: string; reason?: string };
  ownership?: { status?: string };
  recovery?: { status?: string };
  capabilities?: { native?: boolean | { supported: boolean; reason?: string }; nativeReason?: string; targets?: boolean };
}
export interface ClientGateway {
  running: boolean;
  ready?: boolean;
  port: number;
  clients?: ClientConnection[];
}
export interface TargetOption { value: string; label: string }

async function readJson(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || !result || result.ok === false) throw new Error(clientFailure(result, `读取失败（HTTP ${response.status}）`));
  return result;
}

export function useClientManagement() {
  const [installations, setInstallations] = useState<ClientInstallation[]>([]);
  const [gateway, setGateway] = useState<ClientGateway | null>(null);
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [targetRevision, setTargetRevision] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    const results = await Promise.allSettled([
      readJson('/api/clients'), readJson('/api/model-routing/gateway'), readJson('/api/config/model-routing'),
    ]);
    if (ticket !== generation.current) return;
    const failures: Record<string, string> = {};
    for (const [index, result] of results.entries()) {
      const key = ['安装信息', '网关状态', '可选目标'][index];
      if (result.status === 'rejected') {
        failures[key] = result.reason instanceof Error ? result.reason.message : String(result.reason);
        if (index === 0) setInstallations([]);
        if (index === 1) setGateway(null);
        if (index === 2) { setTargets([]); setTargetRevision(null); }
        continue;
      }
      try {
        if (index === 0) {
          if (!Array.isArray(result.value.clients) || !result.value.clients.every((client: ClientInstallation) => client
            && typeof client.id === 'string' && [true, false, null].includes(client.installed))) throw new Error('客户端清单返回格式无效。');
          setInstallations(result.value.clients);
        }
        if (index === 1) {
          if (typeof result.value.running !== 'boolean' || !Number.isInteger(result.value.port)) throw new Error('网关状态返回格式无效。');
          setGateway(result.value);
        }
        if (index === 2) {
          if (typeof result.value.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(result.value.hash)) throw new Error('模型目录版本无效，请刷新后重试。');
          setTargets(clientTargetOptions(result.value));
          setTargetRevision(result.value.hash);
        }
      } catch (error) {
        failures[key] = error instanceof Error ? error.message : String(error);
        if (index === 0) setInstallations([]);
        if (index === 1) setGateway(null);
        if (index === 2) { setTargets([]); setTargetRevision(null); }
      }
    }
    setErrors(failures);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); return () => { generation.current += 1; }; }, [reload]);

  async function act(url: string, body: unknown) {
    if (lock.current) throw new Error('上一项操作尚未结束。');
    lock.current = true;
    setBusy(true);
    try { return await readJson(url, body); }
    finally { lock.current = false; setBusy(false); }
  }
  return { installations, gateway, targets, targetRevision, errors, loading, busy, reload, act };
}
