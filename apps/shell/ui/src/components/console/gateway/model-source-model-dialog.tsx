'use client';

import { useRef, useState } from 'react';
import { Button, Field, InlineFeedback, Input, Modal, Select, type Feedback } from '../console-ui';
import type { CustomModel, RoutingProvider } from '../model-routing/use-routing-config';
import { ModelSourceProtocols } from './model-source-protocols';
import { modelBindingId } from '../../../lib/config/model-routing.mjs';

const EMPTY_MODEL: CustomModel = { id: '', upstreamModel: '', label: '', protocols: ['openai-chat'], provider: '' };

export function ModelSourceModelDialog({
  initialValue,
  providerId,
  providers,
  modelIds,
  onSubmit,
  onClose,
}: {
  initialValue?: CustomModel;
  providerId?: string;
  providers: RoutingProvider[];
  modelIds: string[];
  onSubmit: (next: CustomModel) => void;
  onClose: () => void;
}) {
  const [model, setModel] = useState(() => {
    const parent = providers.find((provider) => provider.id === providerId) ?? providers[0];
    return structuredClone(initialValue
      ? { ...initialValue, upstreamModel: initialValue.upstreamModel ?? initialValue.id }
      : { ...EMPTY_MODEL, provider: parent?.id || '', protocols: parent?.protocols.slice(0, 1) || [] });
  });
  const [error, setError] = useState<Feedback | null>(null);
  const initialFocus = useRef<HTMLInputElement>(null);
  const editingId = initialValue?.id || '';

  function submit() {
    const next = {
      ...model,
      id: model.id.trim().toLowerCase() || modelBindingId(model.provider, model.upstreamModel, modelIds),
      upstreamModel: (model.upstreamModel || '').trim(),
      label: model.label.trim() || (model.upstreamModel || '').trim(),
      provider: model.provider.trim().toLowerCase(),
    };
    const provider = providers.find((item) => item.id === next.provider);
    const message = !next.upstreamModel
      ? '请填写真实上游模型 ID，大小写需与上游一致。'
      : !editingId && modelIds.includes(next.id)
        ? '这个模型标识已在目录中，请勿重复添加。'
        : !providers.some((item) => item.id === next.provider)
          ? '请选择已配置的供应商。'
          : !next.protocols.length
            ? '至少选择一种协议。'
            : !next.protocols.some((protocol) => provider?.protocols.includes(protocol))
              ? '模型与供应商必须至少有一种共同协议。'
            : '';
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
      title={editingId ? '编辑自定义模型' : '添加自定义模型'}
      description="模型加入当前供应商的草稿。真实上游 ID 保留大小写；添加不代表生成已验证。"
      initialFocus={initialFocus}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        {!editingId && providerId && <Field label="所属供应商"><Input aria-label="所属供应商" value={model.provider} disabled /></Field>}
        <Field label="真实上游模型 ID" hint="填写 API 接受的完整 ID，保留原始大小写与路径，不是显示名称。">
          <Input
            ref={initialFocus}
            aria-label="真实上游模型 ID"
            value={model.upstreamModel || ''}
            onChange={(event) => setModel({ ...model, upstreamModel: event.target.value })}
            placeholder="例如 org/Model-Instruct"
          />
        </Field>
        <Field label="本地路由标识" hint="留空自动生成「供应商/模型」唯一标识；保存后保持稳定。">
          <Input
            aria-label="模型标识"
            disabled={!!editingId}
            value={model.id}
            onChange={(event) => setModel({ ...model, id: event.target.value })}
            placeholder={modelBindingId(model.provider, model.upstreamModel || 'model', modelIds)}
          />
        </Field>
        <Field label="显示名称">
          <Input
            aria-label="模型显示名称"
            value={model.label}
            onChange={(event) => setModel({ ...model, label: event.target.value })}
            placeholder="留空使用真实上游 ID"
          />
        </Field>
        {(!!editingId || !providerId) && <Field label="所属供应商" hint={editingId ? '切换后模型会移入该供应商，本地路由标识保持不变。' : undefined}>
          <Select
            aria-label="模型供应商"
            value={model.provider}
            onValueChange={(value) => setModel({ ...model, provider: value })}
            options={providers.map((item) => ({ value: item.id, label: item.id }))}
          />
        </Field>}
        <ModelSourceProtocols
          value={model.protocols}
          available={initialValue?.protocols}
          onChange={(protocols) => setModel({ ...model, protocols })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan" checked={model.enabled !== false} onChange={(event) => setModel({ ...model, enabled: event.target.checked })} />
          启用此模型
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
