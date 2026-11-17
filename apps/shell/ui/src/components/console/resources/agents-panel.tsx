'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { Badge, Button, Empty, ErrorState, Heading, InlineFeedback, Loading, Panel, Select, type Feedback } from '../console-ui';
import { readAgents, runAgentDoctor } from './resource-client';
import type { AgentInventory } from './resource-types';
import { useResourceInventory } from './use-resource-inventory';

export function AgentsPanel() {
  const { state, refresh } = useResourceInventory(readAgents);
  const [lifecycle, setLifecycle] = useState('all');
  const [doctor, setDoctor] = useState<AgentInventory | null>(null);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const rows = state.status === 'ready' ? state.data.agents.filter(row => lifecycle === 'all' || row.lifecycleState === lifecycle) : [];
  async function diagnose() {
    if (running) return;
    setRunning(true);
    setFeedback(null);
    setDoctor(null);
    try {
      const report = await runAgentDoctor();
      setDoctor(report);
      setFeedback({ tone: report.strict.blocked ? 'error' : 'ok', text: report.strict.blocked
        ? `体检完成：${report.strict.blockedAgentIds.length} 个角色被阻止参与实时工作流。` : '体检完成：目录未报告严格模式阻塞。' });
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : String(error) }); }
    finally { setRunning(false); }
  }
  return (
    <>
      <Heading eyebrow="SUBAGENTS" title="角色目录与证据，不是正在运行的代理。"
        description="来自 aios agents list --json。当前管理接口只提供目录读取和 doctor；不提供安装、编辑、删除或启动。"
        actions={<><Button variant="outline" onClick={refresh} disabled={state.status === 'loading' || running}>刷新角色目录</Button>
          <Button onClick={diagnose} disabled={state.status !== 'ready' || running}>{running ? '正在体检…' : '运行角色体检'}</Button></>} />
      <Panel className="mb-4 space-y-2 p-4 text-xs leading-6 text-rex-text-muted">
        <p>能力边界：尚不支持 Subagents 增删改。doctor 只检查本地规范角色与已有证据，不启动真实客户端，不运行 smoke / probe，不生成新的实时验证证据。</p>
        <InlineFeedback feedback={feedback} />
        {doctor && <div aria-label="角色体检结果" className="space-y-1">
          <p>体检读取时间：{doctor.generatedAt}</p>
          <p>阻塞角色：{doctor.strict.blockedAgentIds.join('、') || '无'}</p>
          {doctor.agents.filter(row => row.blockers.length > 0).map(row => <p key={row.agentId} className="break-words">{row.agentId}：{row.blockers.join('；')}</p>)}
        </div>}
      </Panel>
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <Loading label="正在读取 Subagents 目录…" />}
        {state.status === 'error' && <ErrorState message={`${state.unsupported ? '当前运行时不支持角色目录：' : '角色目录读取失败：'}${state.error}`} onRetry={refresh} />}
      </div>
      {state.status === 'ready' && <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rex-border p-4">
          <h2 className="text-sm font-semibold">规范角色 · {rows.length} / {state.data.agents.length}</h2>
          <Select aria-label="按角色阶段筛选" value={lifecycle} onValueChange={setLifecycle} size="sm" className="max-w-60"
            options={[{ value: 'all', label: '全部阶段' }, ...[...new Set(state.data.agents.map(row => row.lifecycleState))].map(value => ({ value,
              label: value === 'candidate' ? '候选' : value === 'projected' ? '已投影' : value }))]} />
        </div>
        <p className="border-b border-rex-border px-4 py-3 text-[11px] text-rex-text-muted">目录读取时间：{state.data.generatedAt}。已投影不等于已验证；是否允许工作流以显式 workflowEnabled 为准。</p>
        {rows.length === 0 ? <Empty icon={Users} title="目录中没有匹配角色"><p>没有匹配项不代表运行时出错；角色增删改尚未提供。</p></Empty>
          : <ul className="divide-y divide-rex-border">{rows.map(row => <li key={row.agentId} className="space-y-2 p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{row.name} <span className="font-normal text-rex-text-muted">{row.agentId}</span></h3>
              <Badge>{row.lifecycleState === 'candidate' ? '候选' : row.lifecycleState === 'projected' ? '已投影' : row.lifecycleState}</Badge>
              <Badge tone={row.workflowEnabled ? 'info' : 'warn'}>{row.workflowEnabled ? '工作流已启用' : '工作流未启用'}</Badge>
              <Badge>证据：{row.verification.status === 'verified' ? '已验证' : row.verification.status === 'blocked' ? '缺少证据' : row.verification.status}</Badge>
            </div>
            <p className="leading-6 text-rex-text-muted">{row.description}</p>
            <p className="break-words text-rex-text-muted">角色：{row.role} · 分类：{row.roleFamily} · 模型声明：{row.model || '未记录'}</p>
            <p className="break-words text-rex-text-muted">投影目标（不是本机安装证明）：{row.clientTargets.join('、') || '未声明'}</p>
            <p className="break-words text-rex-text-muted">工具声明：{row.tools.join('、') || '未声明'}</p>
            <p className="break-all text-rex-text-muted">规范来源：{row.sourceProvenance.canonicalSource}</p>
            <p className="text-rex-text-muted">缺少证据：{row.verification.missing.join('、') || '无'}</p>
            {Object.entries(row.verification.refs).map(([kind, ref]) => <p key={kind} className="break-all font-rex-mono text-[11px] text-rex-text-muted">{kind}：{ref}</p>)}
            {row.blockers.length > 0 && <ul aria-label={`${row.agentId} 阻塞原因`} className="space-y-1 text-rex-orange">{row.blockers.map((reason, index) => <li key={index} className="break-words">{reason}</li>)}</ul>}
          </li>)}</ul>}
      </Panel>}
    </>
  );
}
