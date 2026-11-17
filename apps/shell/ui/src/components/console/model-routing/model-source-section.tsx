'use client';

import { useState } from 'react';
import { Database, Plus, RefreshCw, Search, Server } from 'lucide-react';
import { Button, Empty, InlineFeedback, Input, Modal, Panel, Select, type Feedback } from '../console-ui';
import { ModelSourceModelDialog } from '../gateway/model-source-model-dialog';
import { ModelSourceModelList, SOURCE_LABEL } from '../gateway/model-source-model-list';
import { ModelSourceProviderDetail } from '../gateway/model-source-provider-detail';
import { ModelSourceProviderDialog } from '../gateway/model-source-provider-dialog';
import { ModelSourceProviderNav, UNASSIGNED_PROVIDER } from '../gateway/model-source-provider-nav';
import type { ModelOption } from './intent-routing-section';
import type { CustomModel, RoutingProvider } from './use-routing-config';

type SourceEditor = { kind: 'provider'; value?: RoutingProvider } | { kind: 'model'; value?: CustomModel };

export function ModelSourceSection({
  models, customModels, providers, onChangeCustomModels, onChangeProviders, onRefresh, saving, dirty,
}: {
  models: ModelOption[];
  customModels: CustomModel[];
  providers: RoutingProvider[];
  onChangeCustomModels: (next: CustomModel[]) => void;
  onChangeProviders: (next: RoutingProvider[]) => void;
  onRefresh: () => Promise<{ ok: boolean; text: string }>;
  saving: boolean;
  dirty: boolean;
}) {
  const [editor, setEditor] = useState<SourceEditor | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'refresh' | 'provider' | 'model'; id: string } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const catalog: ModelOption[] = [
    ...models.filter((item) => item.source !== 'custom'),
    ...customModels.map((item) => ({
      ...item, cost: 'unknown', source: 'custom',
      // The adapter may resolve an explicit legacy provider.models declaration.
      provider: item.provider || models.find((entry) => entry.id === item.id)?.provider || '',
    })),
  ];
  const unassigned = catalog.filter((model) => !providers.some((provider) => provider.id === model.provider));
  const selected = providers.find((provider) => provider.id === selectedId)
    ?? (selectedId === UNASSIGNED_PROVIDER && unassigned.length ? undefined : providers[0]);
  const activeId = selected?.id ?? (unassigned.length ? UNASSIGNED_PROVIDER : '');
  const children = selected ? catalog.filter((model) => model.provider === selected.id) : unassigned;
  const filtered = children.filter((item) =>
    (source === 'all' || (item.source || 'curated') === source) &&
    `${item.id} ${item.label} ${item.upstreamModel || ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  function selectProvider(id: string) {
    setSelectedId(id);
    setQuery('');
    setSource('all');
  }
  function stageProvider(next: RoutingProvider, editingId = '') {
    onChangeProviders(editingId ? providers.map((item) => item.id === editingId ? next : item) : [...providers, next]);
    selectProvider(next.id);
    setEditor(null);
  }
  function stageModel(next: CustomModel, editingId = '') {
    onChangeCustomModels(editingId ? customModels.map((item) => item.id === editingId ? next : item) : [...customModels, next]);
    selectProvider(next.provider);
    setEditor(null);
  }
  async function runConfirm() {
    if (!confirm) return;
    const action = confirm;
    setConfirm(null);
    if (action.kind === 'refresh') {
      setRefreshing(true);
      try {
        const result = await onRefresh();
        setFeedback({ text: result.text, tone: result.ok ? 'ok' : 'error' });
      } catch (error) {
        setFeedback({ text: error instanceof Error ? error.message : String(error), tone: 'error' });
      } finally {
        setRefreshing(false);
      }
    } else if (action.kind === 'provider') {
      const declarations = providers.find((provider) => provider.id === action.id)?.models.map((id) => id.toLowerCase()) || [];
      if (catalog.some((item) => {
        const explicit = item.source === 'custom' ? customModels.find((model) => model.id === item.id)?.provider
          : item.source === 'discovered' ? item.provider : '';
        return item.provider === action.id || (!explicit && declarations.includes(item.id.toLowerCase()));
      })) {
        setFeedback({ text: '这个供应商仍被模型引用，请先调整模型来源后再移除。', tone: 'error' });
        return;
      }
      onChangeProviders(providers.filter((item) => item.id !== action.id));
      selectProvider('');
    } else onChangeCustomModels(customModels.filter((item) => item.id !== action.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">管理模型来源</h2>
          <p className="mt-1 text-xs leading-5 text-rex-text-muted">选择供应商，管理它的模型。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline"
            disabled={saving || refreshing || dirty || !providers.some((item) => item.enabled !== false)}
            onClick={() => setConfirm({ kind: 'refresh', id: '' })}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
            {refreshing ? '发现中…' : '刷新模型目录'}
          </Button>
          <Button size="sm" onClick={() => setEditor({ kind: 'provider' })}><Plus size={14} />添加供应商</Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] leading-5 text-rex-text-muted">
        <p>{providers.length} 个供应商 · {catalog.length - unassigned.length} 个所属模型{unassigned.length ? ` · ${unassigned.length} 个待绑定` : ''}</p>
        <p>{dirty ? '请先保存或放弃修改，再刷新目录；未保存的供应商不会被用于发现。' : '刷新范围：所有已保存的供应商'}</p>
      </div>
      <InlineFeedback feedback={feedback} />
      <Panel className="min-w-0 overflow-hidden">
        <div className="grid min-w-0 lg:grid-cols-[224px_minmax(0,1fr)]">
          <ModelSourceProviderNav
            providers={providers.map((provider) => ({ ...provider, modelCount: catalog.filter((model) => model.provider === provider.id).length }))}
            unassignedCount={unassigned.length} activeId={activeId} onSelect={selectProvider}
          />
          <div className="min-w-0">
            {selected ? (
              <ModelSourceProviderDetail key={selected.id} provider={selected}
                onEdit={() => setEditor({ kind: 'provider', value: selected })}
                onRemove={() => setConfirm({ kind: 'provider', id: selected.id })} />
            ) : unassigned.length ? (
              <div className="border-b border-rex-border p-5">
                <h3 className="text-base font-semibold">待绑定模型</h3>
                <p className="mt-2 text-xs leading-6 text-rex-text-muted">这些旧条目没有有效的供应商归属，不可用于路由。编辑自定义模型以明确绑定；不会自动猜测或丢弃配置。</p>
              </div>
            ) : null}
            {!selected && !unassigned.length ? (
              <Empty icon={Server} title="添加第一个模型来源">先添加供应商，再在它下面发现或手动添加模型。本地服务可显式选择无需认证。</Empty>
            ) : (
              <>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="flex items-center gap-2 text-sm font-semibold">
                      <Database size={15} className="text-rex-text-muted" />
                      {selected ? '所属模型' : '待处理条目'}
                      <span className="font-rex-mono text-xs font-normal text-rex-text-muted">{children.length}</span>
                    </h4>
                    {selected && <Button size="sm" onClick={() => setEditor({ kind: 'model' })}><Plus size={14} />手动添加</Button>}
                  </div>
                  {(children.length > 0 || query || source !== 'all') && (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <Search size={14} className="pointer-events-none absolute top-3 left-3 text-rex-text-muted" />
                        <Input aria-label="搜索模型目录" value={query} onChange={(event) => setQuery(event.target.value)}
                          placeholder="搜索此供应商的模型…" className="pl-9" />
                      </div>
                      <Select aria-label="筛选模型来源" value={source} onValueChange={setSource} className="sm:w-36"
                        options={[{ value: 'all', label: '全部来源' }, ...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))]} />
                    </div>
                  )}
                </div>
                {filtered.length ? (
                  <ModelSourceModelList models={filtered} providerId={selected?.id || '待绑定'}
                    onEdit={(id) => setEditor({ kind: 'model', value: customModels.find((item) => item.id === id) })}
                    onRemove={(id) => setConfirm({ kind: 'model', id })} />
                ) : (
                  <Empty icon={Database} title={children.length ? '没有符合条件的模型' : '这个供应商还没有模型'}>
                    {children.length ? '调整搜索或来源筛选，查看当前供应商的其他模型。' : '手动填写真实上游 ID，或保存配置后刷新模型目录。'}
                  </Empty>
                )}
                <p className="border-t border-rex-border px-4 py-3 text-[11px] leading-5 text-rex-text-muted sm:px-5">
                  仅展示显式配置的模型，内置模板不会自动加入。发现列表不代表凭据、生成或配额已验证。
                </p>
              </>
            )}
          </div>
        </div>
      </Panel>
      {editor?.kind === 'provider' && (
        <ModelSourceProviderDialog initialValue={editor.value} providers={providers}
          onSubmit={(next) => stageProvider(next, editor.value?.id)} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === 'model' && (
        <ModelSourceModelDialog initialValue={editor.value} providerId={selected?.id} providers={providers}
          modelIds={catalog.map((item) => item.id)}
          onSubmit={(next) => stageModel(next, editor.value?.id)} onClose={() => setEditor(null)} />
      )}
      <Modal open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirm?.kind === 'refresh' ? '刷新所有供应商的模型目录？' : `从草稿中移除 ${confirm?.id || ''}？`}
        description={confirm?.kind === 'refresh'
          ? '将读取所有已保存供应商的上游模型列表，并更新本地目录，不仅是当前选中的供应商。不会调用模型生成内容。'
          : '只修改当前草稿，保存全部修改后才会生效。若仍用于模型分配，保存时会进行校验。'}>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>取消</Button>
          <Button variant={confirm?.kind === 'refresh' ? 'default' : 'danger'} onClick={() => void runConfirm()}>
            确认{confirm?.kind === 'refresh' ? '刷新' : '移除'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
