'use client';

import { t } from '../../../i18n/t.mjs';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Panel, Select, SmallTitle, Textarea } from '../console-ui';
import { modelLabel } from './policy/model-label';

export interface IntentRouting {
  enabled: boolean;
  classifierModel: string;
  confidenceThreshold?: number;
  intents: { id: string; description: string; modelId: string; fallback?: string[] }[];
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
const MODEL_SELECT_CLASS = 'h-auto min-h-9 gap-1.5 px-2.5 py-2 sm:gap-2 sm:px-3 [&>span:first-child]:whitespace-normal [&>span:first-child]:[overflow-wrap:anywhere]';

function modelOptions(models: ModelOption[]) {
  return [
    { value: '', label: t("选择模型") },
    ...models.map((model) => ({ value: model.id, label: modelLabel(model) })),
  ];
}

function nextIntentId(intents: IntentRouting['intents']) {
  const used = new Set(intents.map((intent) => intent.id.trim().toLowerCase()));
  let number = 1;
  while (used.has(`intent-${number}`)) number += 1;
  return `intent-${number}`;
}

function ruleView(intents: IntentRouting['intents'], firstKey = 0) {
  return {
    intents,
    keys: intents.map((_, index) => firstKey + index),
    nextKey: firstKey + intents.length,
    editing: null as number | null,
  };
}

export function IntentRoutingSection({
  value,
  models,
  targets,
  onChange,
}: {
  value: IntentRouting;
  models: ModelOption[];
  targets?: ModelOption[];
  onChange: (next: IntentRouting) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState<HTMLElement | null>(null);
  const cancelClear = useRef<HTMLButtonElement>(null);
  const enableToggle = useRef<HTMLButtonElement>(null);
  const addRule = useRef<HTMLButtonElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const summaries = useRef(new Map<number, HTMLButtonElement>());
  const [view, setView] = useState(() => ruleView(value.intents));
  // UI keys survive our edits (including ID changes). A replaced document resets the editor.
  if (view.intents !== value.intents) setView(ruleView(value.intents, view.nextKey));
  const hasSettings = Boolean(value.classifierModel || value.intents.length);
  const availableModels = models.filter((model) => model.enabled !== false);
  const availableTargets = (targets ?? models).filter((model) => model.enabled !== false);
  const classifierOptions = availableModels.filter((model) =>
    model.protocols.some((proto) => CLASSIFIER_PROTOCOLS.includes(proto))
  );
  const setIntent = (index: number, patch: Partial<IntentRouting['intents'][number]>) => {
    const intents = value.intents.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setView({ ...view, intents });
    onChange({ ...value, intents });
  };
  const removeIntent = (index: number) => {
    const neighbor = view.keys[index + 1] ?? view.keys[index - 1];
    const fallback = addRule.current?.disabled ? enableToggle.current : addRule.current;
    const focusTarget = summaries.current.get(neighbor) ?? fallback;
    const intents = value.intents.filter((_, i) => i !== index);
    setRestoreFocus(focusTarget);
    setView({ ...view, intents, keys: view.keys.filter((_, i) => i !== index), editing: null });
    onChange({ ...value, intents });
  };
  const editingIndex = view.editing;
  const editingIntent = editingIndex === null ? undefined : value.intents[editingIndex];
  const editingTarget = editingIntent ? availableTargets.find((model) => model.id === editingIntent.modelId) : undefined;
  const editingAuto = Boolean(targets) && editingIntent?.modelId === 'auto';
  const closeEditor = () => setView({ ...view, editing: null });

  return (
    <Panel className="min-w-0 p-3 sm:p-6">
      <SmallTitle
        action={
          <Badge tone={value.enabled ? 'info' : 'neutral'}>
            {value.enabled ? t("草稿：已启用") : t("草稿：已关闭")}
          </Badge>
        }
      >
        
        {t("意图分流")}
      </SmallTitle>
      <p className="mb-4 text-xs leading-6 text-rex-text-muted">
        
        {t("可选：由分类器根据规则描述判断普通对话的意图，再使用该规则指定的模型。显式指定角色的任务不经过分类器。")}
      </p>
      {availableModels.length < 2 && (
        <p className="mb-4 text-xs leading-6 text-rex-text-muted">
          {availableModels.length === 1
            ? t("当前只有一个合资格的已绑定模型，网关可直接选择，无需分类器。请求仍可能因协议翻译、认证或额度而失败，配置列表不代表生成可用。")
            : t("尚无可选的已绑定模型。请先在「供应商与模型」添加来源并绑定模型。")}
        </p>
      )}
      {availableModels.length >= 2 && classifierOptions.length === 0 && (
        <p className="mb-4 text-xs leading-6 text-rex-text-muted">
          
          {t("暂无声明支持 OpenAI Chat 或 Claude 协议的分类器模型，请先检查模型绑定与协议配置。")}
        </p>
      )}

      <label className="flex items-center gap-3 text-xs font-medium leading-6">
        <button
          ref={enableToggle}
          type="button"
          role="switch"
          aria-checked={value.enabled}
          aria-label={t("启用按意图路由")}
          disabled={!value.enabled && (availableModels.length < 2 || classifierOptions.length === 0)}
          onClick={() => {
            setView({ ...view, editing: null });
            onChange({ ...value, enabled: !value.enabled });
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan ${value.enabled ? 'bg-rex-cyan' : 'bg-rex-border'}`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 rounded-full bg-rex-bg transition-transform duration-150 motion-reduce:transition-none ${value.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </button>
        
        {t("启用按意图路由")}
      </label>

      {!value.enabled ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-6 text-rex-text-muted">{t("关闭时使用普通路由，不调用分类器。")}</p>
          {hasSettings && (
            <>
              <p className="text-xs leading-6 text-rex-text-muted">
                
                {t("已填写的模型引用仍需有效。可开启后继续编辑，或清空分类器与全部规则后统一保存。")}
              </p>
              <Button type="button" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal py-2" onClick={() => setConfirmClear(true)}>
                
                {t("清空意图设置")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-rex-sm border border-rex-orange/30 bg-rex-orange/5 p-3 text-xs leading-6">
            <p>{t("意图分类会额外增加分类器调用与费用。携带会话标识时，同一轮工具续轮复用已判断的意图，不重复分类。")}</p>
            <p className="mt-1 text-rex-text-muted">{t("分类失败会返回普通路由；若没有兼容的路由，请求仍可能失败。")}</p>
          </div>

          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium">{t("分类器模型")}</span>
            <Select
              aria-label={t("分类器模型")}
              value={classifierOptions.some((model) => model.id === value.classifierModel) ? value.classifierModel : ''}
              onValueChange={(classifierModel) => onChange({ ...value, classifierModel })}
              className={MODEL_SELECT_CLASS}
              options={modelOptions(classifierOptions)}
            />
            <p className="text-xs leading-6 text-rex-text-muted">
              
              {t("仅限声明支持 OpenAI Chat 或 Claude 协议的已绑定模型；实际协议兼容性、认证与额度尚未验证。")}
            </p>
          </div>

          <Field label={t("置信度门槛")} hint={t("分类器需给出 0..1 的自报置信度；低于门槛时回落到默认路由，不在猜测上发往意图模型。留空表示不启用分级。")}>
            <Select
              aria-label={t("意图置信度门槛")}
              value={typeof value.confidenceThreshold === 'number' ? String(value.confidenceThreshold) : ''}
              onValueChange={(next) => onChange({ ...value, ...(next ? { confidenceThreshold: Number(next) } : { confidenceThreshold: undefined }) })}
              options={[
                { value: '', label: t("不分级（按意图直接路由）") },
                { value: '0.5', label: t("0.5 · 宽松") },
                { value: '0.7', label: t("0.7 · 推荐") },
                { value: '0.9', label: t("0.9 · 严格") },
              ]}
            />
          </Field>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium">{t("意图规则")}</h3>
              <span className="text-[11px] text-rex-text-muted">{value.intents.length}  {t("条")}</span>
            </div>
            <p className="text-xs leading-6 text-rex-text-muted">
              
              {t("按描述匹配请求，再交给目标模型。点击规则会在弹窗中编辑。")}
            </p>
            {value.intents.length === 0 ? (
              <p className="rounded-rex-sm border border-dashed border-rex-border p-4 text-xs leading-6 text-rex-text-muted">
                
                {t("尚无意图规则。请至少添加一条规则并选择分类器模型，再保存启用。")}
              </p>
            ) : (
              <ul aria-label={t("意图规则")} className="divide-y divide-rex-border border-y border-rex-border">
                {value.intents.map((intent, index) => {
                  const key = view.keys[index];
                  const target = availableTargets.find((model) => model.id === intent.modelId);
                  const autoTarget = Boolean(targets) && intent.modelId === 'auto';
                  return (
                    <li key={key} className="min-w-0" data-snap="intent-edit">
                      <button
                        ref={(element) => { if (element) summaries.current.set(key, element); else summaries.current.delete(key); }}
                        type="button"
                        aria-label={t("编辑意图 {value0}", { value0: index + 1 })}
                        onClick={() => setView({ ...view, editing: index })}
                        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-rex-sm px-2 py-3 text-left hover:bg-rex-panel-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-3 sm:py-4"
                      >
                        <span aria-hidden="true" className="font-rex-mono text-[11px] leading-6 text-rex-text-muted">{String(index + 1).padStart(2, '0')}</span>
                        <span className="col-span-2 row-start-2 grid min-w-0 gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-4">
                          <span className={`line-clamp-2 text-sm font-medium leading-6 [overflow-wrap:anywhere] ${intent.description.trim() ? '' : 'text-rex-text-muted'}`}>
                            {intent.description.trim() || t("待填写描述")}
                          </span>
                          <span className="flex min-w-0 items-start gap-2 text-xs leading-6 text-rex-text-muted">
                            <ArrowRight aria-hidden="true" size={12} className={`mt-1.5 shrink-0 ${target || autoTarget ? '' : 'text-rex-orange'}`} />
                            <span className="min-w-0 [overflow-wrap:anywhere]">{target ? modelLabel(target) : autoTarget ? t("自动选择（不指定固定目标）") : t("待选择目标模型")}</span>
                          </span>
                        </span>
                        <span className="col-start-2 row-start-1 shrink-0 text-xs leading-6 text-rex-cyan sm:col-start-3">{t("编辑")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              ref={addRule}
              type="button"
              variant="ghost"
              disabled={availableModels.length < 2}
              className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-rex-cyan"
              onClick={() => {
                const intents = [...value.intents, { id: nextIntentId(value.intents), description: '', modelId: '' }];
                setView({ intents, keys: [...view.keys, view.nextKey], nextKey: view.nextKey + 1, editing: intents.length - 1 });
                onChange({ ...value, intents });
              }}
            >
              <Plus size={14} strokeWidth={1.8} />
              
              {t("添加意图规则")}
            </Button>
          </div>

          {value.intents.length > 0 && (
            <details className="min-w-0 rounded-rex-sm border border-rex-border p-3 sm:p-4">
              <summary className="cursor-pointer rounded-rex-sm text-xs font-medium leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rex-cyan">
                
                {t("高级：内部意图 ID")}
              </summary>
              <p className="mt-3 text-xs leading-6 text-rex-text-muted">
                
                {t("新规则会自动生成内部 ID，通常无需修改。手动编辑时请保持非空且唯一。")}
              </p>
              <div className="mt-3 space-y-4">
                {value.intents.map((intent, index) => (
                  <label key={view.keys[index]} className="min-w-0 space-y-2">
                    <span className="block text-xs font-medium leading-6">{t("意图")} {index + 1} ID</span>
                    <Input
                      aria-label={t("意图 {value0} id", { value0: index + 1 })}
                      value={intent.id}
                      onChange={(event) => setIntent(index, { id: event.target.value })}
                      className="h-auto min-h-9 py-2 font-rex-mono"
                    />
                  </label>
                ))}
              </div>
            </details>
          )}
          <p className="text-xs leading-6 text-rex-text-muted">{t("使用底部「保存全部修改」统一保存。")}</p>
        </div>
      )}
      <Modal
        open={editingIndex !== null && editingIntent !== undefined}
        onOpenChange={(open) => { if (open) setRestoreFocus(null); else closeEditor(); }}
        title={editingIntent ? t("编辑意图 {value0}", { value0: editingIndex! + 1 }) : t("编辑意图")}
        description={t("修改会立即写入草稿，关闭弹窗不会撤销；点底部「保存全部修改」后才会写入配置。")}
        initialFocus={descriptionInput}
        restoreFocusTo={{ current: restoreFocus }}
      >
        <div className="space-y-5">
          <Field label={t("匹配描述")} hint={t("写清楚什么样的请求属于这个意图，例如“快速问答、简单查询、日常闲聊”。")}>
            <Textarea
              ref={descriptionInput}
              aria-label={t("意图 {value0} 描述", { value0: editingIndex! + 1 })}
              rows={3}
              value={editingIntent?.description ?? ''}
              onChange={(event) => setIntent(editingIndex!, { description: event.target.value })}
              placeholder={t("什么样的请求属于这个意图")}
              className="resize-y py-2 leading-6"
            />
          </Field>
          <Field label={t("目标模型")} hint={t("留空表示不指定固定目标；候选由上方已绑定的模型与模型组决定。")}>
            <Select
              aria-label={t("意图 {value0} 模型", { value0: editingIndex! + 1 })}
              value={editingIntent && (editingTarget || editingAuto) ? editingIntent.modelId : ''}
              onValueChange={(modelId) => setIntent(editingIndex!, { modelId })}
              className={MODEL_SELECT_CLASS}
              options={[...modelOptions(availableTargets), ...(targets ? [{ value: 'auto', label: t("自动选择（不指定固定目标）") }] : [])]}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 border-t border-rex-border pt-4">
            <Button type="button" variant="ghost" onClick={closeEditor}>{t("关闭")}</Button>
            <Button type="button" variant="danger" aria-label={t("删除意图 {value0}", { value0: editingIndex! + 1 })} onClick={() => removeIntent(editingIndex!)}>
              <Trash2 aria-hidden="true" size={14} strokeWidth={1.8} />
              
              {t("删除规则")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("清空意图设置？")}
        description={t("将从草稿中移除分类器模型与全部意图规则，保持意图分流关闭。不会更改默认分配或客户端例外；点击底部「保存全部修改」后才会写入配置。")}
        initialFocus={cancelClear}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={cancelClear} type="button" variant="ghost" onClick={() => setConfirmClear(false)}>{t("取消")}</Button>
          <Button type="button" variant="danger" onClick={() => {
            onChange({ ...value, enabled: false, classifierModel: '', intents: [] });
            setConfirmClear(false);
          }}>{t("确认清空")}</Button>
        </div>
      </Modal>
    </Panel>
  );
}
