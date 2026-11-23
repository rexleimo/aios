'use client';

import { t } from '../../../i18n/t.mjs';
// All editing sections share this draft and save boundary; monitoring reads saved facts separately.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntentRouting, ModelOption } from './intent-routing-section';
import type { Feedback } from '../console-ui';
import { migrateEditableTargets, migrateTargetRefs, routingTargetReferences, toModelBindings, toModelCatalog, toRoutingTargets } from '../../../lib/config/model-routing.mjs';
import { describePolicyChanges, inheritPolicyDocument, projectPolicyAssignment, toPolicyContext } from '../../../lib/config/routing-policy.mjs';

export interface RoutingProvider {
  id: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey?: string;
  authMode?: 'required' | 'none';
  endpointStyle?: 'standard' | 'relay';
  protocolBaseUrls?: Record<string, string>;
  baseProtocol?: string;
  preset?: string;
  presetRegion?: string;
  authHeader?: 'x-api-key' | 'bearer' | 'both';
  headers?: Record<string, string>;
  enabled?: boolean;
  protocols: string[];
  models: string[];
  accounts?: { id: string; apiKeyEnv: string; apiKey?: string }[];
}
export interface CustomModel {
  id: string;
  label: string;
  protocols: string[];
  provider: string;
  upstreamModel?: string;
  enabled?: boolean;
}
export interface RoutingGroup {
  id: string;
  models: string[];
  routing: string;
  enabled?: boolean;
}
export interface RoutingEditable {
  targetRefVersion?: number;
  activeModel: string;
  clientDefaults: Record<string, string>;
  providers: RoutingProvider[];
  customModels: CustomModel[];
  matrix: { default: Record<string, string>; clients: Record<string, Record<string, string>> };
  routingGroups: RoutingGroup[];
  intentRouting: IntentRouting;
}
export interface AutoRole {
  role: string;
  taskType: string;
  autoModelId: string;
  effectiveModelId: string;
  available?: boolean;
  unavailableModelId?: string;
  overridden: boolean;
  label: string;
  cost: string;
  speed: string;
  ruleDescription: string;
}
export type RoutingStatus = 'loading' | 'ready' | 'error' | 'saving';
type ModelBinding = ModelOption & { declaredProvider?: string };

export function useRoutingConfig() {
  const [editable, setEditable] = useState<RoutingEditable | null>(null);
  const [auto, setAuto] = useState<AutoRole[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelBindings, setModelBindings] = useState<ModelBinding[]>([]);
  const [policyContext, setPolicyContext] = useState<ReturnType<typeof toPolicyContext>>({ targetRefVersion: 1, roleDefaults: {}, routingRules: [] });
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState<RoutingStatus>('loading');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<RoutingEditable | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const busy = useRef(false);
  const dirty = editable !== null && JSON.stringify(editable) !== JSON.stringify(saved);

  const read = useCallback(async () => {
    const res = await fetch('/api/config/model-routing', { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || body.error || t("读取失败"));
    const loaded = migrateEditableTargets({ ...body.editable, activeModel: body.editable.activeModel ?? '', clientDefaults: body.editable.clientDefaults ?? {}, routingGroups: body.editable.routingGroups ?? [] });
    setEditable(loaded);
    setSaved(loaded);
    setAuto(Array.isArray(body.auto) ? body.auto : []);
    setModels(Array.isArray(body.models) ? body.models : []);
    setModelBindings(Array.isArray(body.modelBindings) ? body.modelBindings : Array.isArray(body.models) ? body.models : []);
    const context = toPolicyContext(body.policyContext || {});
    const migratedContext = toPolicyContext(migrateTargetRefs(context));
    // Context-only blockers use the server context's original syntax version.
    if (Array.isArray(context.targetReferences)) migratedContext.targetReferences = context.targetReferences.map(({ value, path }: { value: string; path: string }) => ({
      path, value: migrateTargetRefs({ targetRefVersion: context.targetRefVersion, activeModel: value }).activeModel,
    }));
    setPolicyContext(migratedContext);
    setHash(body.hash);
    setError('');
  }, []);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('loading');
    setFeedback(null);
    try {
      await read();
      setStatus('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [read]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const saveDocument = useCallback(
    async (next: RoutingEditable): Promise<{ ok: boolean; text: string }> => {
      if (busy.current) return { ok: false, text: t("上一项操作尚未结束，请稍后重试。") };
      busy.current = true;
      setStatus('saving');
      setFeedback(null);
      try {
        const res = await fetch('/api/config/model-routing', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ editable: next, expectedHash: hash }),
        });
        const body = await res.json();
        if (!res.ok)
          throw new Error(
            res.status === 409
              ? t("配置已被其他窗口或 CLI 修改。草稿已保留，请重新读取配置后再编辑。")
              : body.detail || body.error || t("保存失败")
          );
        let text = body.changed?.length
          ? body.backup ? t("配置已保存，写入前已自动备份。") : t("配置已保存。")
          : t("配置没有变化。");
        // A failed follow-up read must not turn an acknowledged disk write into a failed save.
        setSaved(next);
        setEditable(next);
        if (body.hash) setHash(body.hash);
        try {
          await read();
        } catch (readError) {
          text = t("配置已写入，但未能重新读取。请重新读取配置确认。");
          setError(readError instanceof Error ? readError.message : String(readError));
        }
        setStatus('ready');
        setFeedback({ tone: 'ok', text });
        return { ok: true, text };
      } catch (saveError) {
        setStatus('ready');
        const text = saveError instanceof Error ? saveError.message : String(saveError);
        setFeedback({ tone: 'error', text });
        return { ok: false, text };
      } finally {
        busy.current = false;
      }
    },
    [hash, read]
  );

  const save = useCallback(async (): Promise<{ ok: boolean; text: string }> => {
    if (!editable) return { ok: false, text: t("没有可保存的配置") };
    return saveDocument(editable);
  }, [editable, saveDocument]);

  const refreshModels = useCallback(async (): Promise<{ ok: boolean; text: string }> => {
    if (dirty) return { ok: false, text: t("请先保存或放弃未保存的修改，再刷新模型目录。") };
    if (busy.current) return { ok: false, text: t("上一项操作尚未结束，请稍后重试。") };
    busy.current = true;
    setStatus('saving');
    try {
      const res = await fetch('/api/model-routing/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false)
        throw new Error(body.stderr || body.detail || body.error || t("刷新失败"));
      const result = body.result ?? {};
      const failedSources = Array.isArray(result.providers)
        ? result.providers.flatMap((provider: { provider?: string; errors?: { protocol?: string }[] }) =>
            (Array.isArray(provider.errors) ? provider.errors : []).map((failure) =>
              `${provider.provider || t("未知供应商")} / ${failure.protocol || t("未知协议")}`
            )
          )
        : [];
      const text = t("发现 {value0} 个模型，新增 {value1}、补协议 {value2}。仅发现列表，尚未验证生成可用性{value3}", { value0: result.discovered ?? 0, value1: result.added ?? 0, value2: result.enriched ?? 0, value3: failedSources.length ? t("。部分来源读取失败：{value0}；已有目录已保留。", { value0: failedSources.join('、') }) : '' });
      await read();
      setStatus('ready');
      return { ok: true, text };
    } catch (refreshError) {
      setStatus('ready');
      return { ok: false, text: refreshError instanceof Error ? refreshError.message : String(refreshError) };
    } finally {
      busy.current = false;
    }
  }, [dirty, read]);

  const discard = () => {
    setEditable(saved ? structuredClone(saved) : null);
    setFeedback(null);
  };
  const draftDocument = editable ? {
    ...policyContext,
    targetRefVersion: editable.targetRefVersion,
    activeModel: editable.activeModel,
    clientDefaults: editable.clientDefaults,
    clientRoleMatrix: editable.matrix,
    routingGroups: Object.fromEntries(editable.routingGroups.map((group) => [group.id, group])),
    intentRouting: editable.intentRouting,
    providers: Object.fromEntries(editable.providers.map((provider) => [provider.id.trim().toLowerCase(), provider])),
    models: Object.fromEntries([
      ...modelBindings.filter((model) => model.source !== 'custom').map((model) => [model.id, {
        ...model,
        // A provider.models binding must not become an explicit discovered-model binding in drafts.
        provider: model.declaredProvider ?? model.provider,
      }]),
      ...editable.customModels.map((model) => [saved?.customModels.some((previous) => previous.id === model.id) ? model.id : model.id.trim().toLowerCase(), { ...model, provider: model.provider.trim().toLowerCase(), source: 'custom', cost: 'unknown' }]),
    ]),
  } : null;
  const draftModels: ModelOption[] = draftDocument ? toModelCatalog(draftDocument) : models;
  const targets: ModelOption[] = draftDocument ? toRoutingTargets(draftDocument) : [];
  // Management keeps inactive definitions; strategy pickers only receive route candidates.
  const managementModels: ModelOption[] = draftDocument ? toModelBindings(draftDocument) : modelBindings;
  const policyPreview = (role = '', clientId = '', inherit = false) => projectPolicyAssignment(
    inherit ? inheritPolicyDocument(draftDocument || {}, role, clientId) : draftDocument || {},
    { role, clientId }
  );
  const changes: string[] = describePolicyChanges(saved, editable);
  return {
    editable,
    auto,
    models: draftModels,
    targets,
    targetReferences: (target: string): string[] => routingTargetReferences(draftDocument || {}, target),
    managementModels,
    policyPreview,
    changes,
    hash,
    status,
    error,
    dirty,
    feedback,
    reload,
    discard,
    setEditable,
    save,
    saveDocument,
    refreshModels,
  };
}

export type RoutingController = ReturnType<typeof useRoutingConfig>;
