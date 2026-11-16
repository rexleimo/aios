'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Panel, Select, SmallTitle } from '../console-ui';

export interface IntentRouting {
  enabled: boolean;
  classifierModel: string;
  intents: { id: string; description: string; modelId: string }[];
}
export interface ModelOption {
  id: string;
  label: string;
  protocols: string[];
  cost: string;
  source?: string;
  provider?: string;
  upstreamModel?: string;
  generationVerified?: boolean;
  enabled?: boolean;
}

const CLASSIFIER_PROTOCOLS = ['openai-chat', 'claude'];

export function IntentRoutingSection({
  value,
  models,
  onChange,
}: {
  value: IntentRouting;
  models: ModelOption[];
  onChange: (next: IntentRouting) => void;
}) {
  const classifierOptions = models.filter((model) =>
    model.protocols.some((proto) => CLASSIFIER_PROTOCOLS.includes(proto))
  );
  const setIntent = (index: number, patch: Partial<IntentRouting['intents'][number]>) => {
    onChange({
      ...value,
      intents: value.intents.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };

  return (
    <Panel className="p-6">
      <SmallTitle
        action={
          <Badge tone={value.enabled ? 'info' : 'neutral'}>
            {value.enabled ? '草稿：已启用' : '草稿：已关闭'}
          </Badge>
        }
      >
        普通对话 · 意图路由
      </SmallTitle>
      <p className="mb-4 text-xs leading-6 text-rex-text-muted">
        每轮新对话先由一个便宜模型判断意图（多一次分类器调用），再把请求路由到该意图对应的模型；同一轮的工具续轮沿用判断结果，不重复分类。判断失败自动回落默认模型，请求不会卡住；编排器显式指定角色的任务不经过分类器。
      </p>
      {models.length < 2 && <p className="mb-4 text-xs leading-6 text-rex-text-muted">
        {models.length === 1 ? '当前只有一个已绑定模型，请求直接交给它，无需分类器或额外分类费用。' : '尚无已绑定模型。先添加供应商，再发现模型或手动填写真实上游模型 ID。'}
      </p>}

      <label className="mb-4 flex items-center gap-2 text-xs font-medium">
        <button
          type="button"
          role="switch"
          aria-checked={value.enabled}
          aria-label="启用按意图路由"
          disabled={!value.enabled && (models.length < 2 || classifierOptions.length === 0)}
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan ${value.enabled ? 'bg-rex-cyan' : 'bg-rex-border'}`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-rex-bg transition-transform duration-150 motion-reduce:transition-none ${value.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </button>
        启用按意图路由
      </label>

      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-rex-text-muted">分类器模型</span>
        <fieldset disabled={models.length < 2} className="min-w-0 flex-1">
        <Select
          size="sm"
          aria-label="分类器模型"
          value={classifierOptions.some((model) => model.id === value.classifierModel) ? value.classifierModel : ''}
          onValueChange={(v) => onChange({ ...value, classifierModel: v })}
          options={[
            { value: '', label: '选一个便宜快的模型' },
            ...classifierOptions.map((model) => ({
              value: model.id,
              label: `${model.label}（${model.id}）`,
            })),
          ]}
        />
        {value.classifierModel && !classifierOptions.some((model) => model.id === value.classifierModel) && <p className="mt-1 text-[11px] text-rex-text-muted">保留旧引用 {value.classifierModel}，当前不可选。</p>}
        </fieldset>
      </div>

      <div className="space-y-2">
        <div className="hidden items-center gap-2 text-[11px] text-rex-text-muted lg:flex">
          <span className="w-24 shrink-0">意图 id</span>
          <span className="flex-1">描述（分类器读它来判断）</span>
          <span className="w-44 shrink-0">路由到模型</span>
          <span className="w-6 shrink-0" />
        </div>
        {value.intents.map((intent, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-2 rounded-rex-sm border border-rex-border p-3 text-xs lg:flex lg:border-0 lg:p-0"
          >
            <Input
              size="sm"
              aria-label={`意图 ${index + 1} id`}
              value={intent.id}
              onChange={(event) => setIntent(index, { id: event.target.value })}
              placeholder="如 quick"
              className="col-start-1 w-full lg:w-24 lg:shrink-0"
            />
            <Input
              size="sm"
              aria-label={`意图 ${index + 1} 描述`}
              value={intent.description}
              onChange={(event) => setIntent(index, { description: event.target.value })}
              placeholder="什么样的请求算这个意图"
              className="col-start-1 flex-1"
            />
            <fieldset disabled={models.length === 0} className="col-start-1 min-w-0 lg:w-44 lg:shrink-0">
            <Select
              size="sm"
              aria-label={`意图 ${index + 1} 模型`}
              value={models.some((model) => model.id === intent.modelId) ? intent.modelId : ''}
              onValueChange={(v) => setIntent(index, { modelId: v })}
              className="col-start-1 w-full lg:w-44 lg:shrink-0"
              options={[
                { value: '', label: '选模型' },
                ...models.map((model) => ({ value: model.id, label: model.label })),
              ]}
            />
            {intent.modelId && !models.some((model) => model.id === intent.modelId) && <p className="mt-1 text-[11px] text-rex-text-muted">保留旧引用 {intent.modelId}，当前不可选。</p>}
            </fieldset>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`删除意图 ${intent.id || index + 1}`}
              onClick={() => onChange({ ...value, intents: value.intents.filter((_, i) => i !== index) })}
              className="col-start-2 row-start-1 size-7 shrink-0 text-rex-text-muted hover:text-rex-text"
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </Button>
          </div>
        ))}
        {value.enabled && value.intents.length === 0 && (
          <p className="text-xs text-rex-text-muted">至少加一个意图，否则分类器无从判断。</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="outline"
          disabled={models.length < 2}
          onClick={() =>
            onChange({ ...value, intents: [...value.intents, { id: '', description: '', modelId: '' }] })
          }
        >
          <Plus size={14} strokeWidth={1.8} className="mr-1 inline" />
          加一个意图
        </Button>
        <span className="text-[11px] text-rex-text-muted">使用底部「保存全部修改」统一保存。</span>
      </div>
    </Panel>
  );
}
