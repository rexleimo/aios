'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Plug, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { TOOLS, type DemoActivity, type DemoProject } from './demo-data';
import { Badge, Button, Heading, Modal, Panel } from './console-ui';

import { McpWizard } from './flows/mcp-wizard';
import { RESULT, type ServiceResult } from './flows/service-state';

export function McpWorkspace({
  project,
  record,
  recovered,
  onRecovered,
}: {
  project: DemoProject;
  record: (activity: DemoActivity) => void;
  recovered: boolean;
  onRecovered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [diagnostic, setDiagnostic] = useState<number | null>(null);
  const [added, setAdded] = useState<{ name: string; tools: string[]; scope: string; result: ServiceResult }[]>([]);
  const services = [
    {
      name: '浏览器',
      detail: 'Playwright · 网页访问与自动化',
      tools: 'Claude Code、Codex',
      scope: '用户级',
      result: recovered ? ('passed' as const) : ('failed' as const),
    },
    {
      name: '代码结构',
      detail: 'Code Review Graph · 理解代码关系',
      tools: 'Claude Code、Gemini CLI',
      scope: '用户级',
      result: 'written' as const,
    },
    ...added.map((item) => ({
      ...item,
      detail: '本次体验添加的服务 · 示例',
      tools: item.tools.map((id) => TOOLS.find((tool) => tool.id === id)?.name).join('、'),
    })),
  ];
  return (
    <>
      <Heading
        eyebrow="MCP SERVICES"
        title="让能力，连接到合适的工具。"
        description="看清服务装在哪里、配置是否可读，以及最近一次连接测试的结果。"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} />
            添加 MCP 服务
          </Button>
        }
      />
      <div className="mb-6 flex gap-2 rounded-xl bg-rex-panel p-4 text-xs leading-5 text-rex-text-muted">
        <ShieldCheck size={16} className="shrink-0 text-rex-cyan" />
        配置写入、连接测试分别记录。这里的所有结果均为交互示例。
      </div>
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[1.1fr_1fr_150px_130px] gap-4 border-b border-rex-border bg-rex-panel/40 px-5 py-3 text-[11px] text-rex-text-muted lg:grid">
          <span>服务</span>
          <span>使用它的工具</span>
          <span>连接状态</span>
          <span className="text-right">操作</span>
        </div>
        {services.map((service, index) => (
          <div
            key={`${service.name}:${index}`}
            className="grid items-center gap-4 border-b border-rex-border p-5 last:border-0 lg:grid-cols-[1.1fr_1fr_150px_130px]"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-rex-panel p-2.5 text-rex-text-muted">
                <Plug size={18} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{service.name}</h2>
                <p className="mt-1 text-[11px] text-rex-text-muted">{service.detail}</p>
              </div>
            </div>
            <div>
              <p className="text-xs leading-5">{service.tools}</p>
              <p className="mt-1 text-[11px] text-rex-text-muted">{service.scope}</p>
            </div>
            <div>
              <Badge tone={RESULT[service.result].tone}>{RESULT[service.result].label}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDiagnostic(index)}>
              {index === 0 ? '诊断与恢复' : '查看配置'}
              <ChevronRight size={13} />
            </Button>
          </div>
        ))}
      </Panel>
      <Modal
        open={diagnostic !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDiagnostic(null);
        }}
        title={`${services[diagnostic ?? 0]?.name} · ${diagnostic === 0 ? '诊断与恢复' : '配置详情'}`}
        description={`示例 · ${services[diagnostic ?? 0]?.tools} · ${services[diagnostic ?? 0]?.scope}`}
      >
        {diagnostic === 0 ? (
          <>
            <div className="rounded-xl border border-rex-border bg-rex-panel/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                {recovered ? (
                  <CheckCircle2 size={17} className="text-rex-green" />
                ) : (
                  <AlertTriangle size={17} className="text-rex-danger" />
                )}
                {recovered ? '模拟连接测试通过' : '未找到启动命令'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-rex-text-muted">
                {recovered
                  ? '原型已展示恢复后的结果，未运行任何真实服务。'
                  : '示例原因：配置中的程序在当前环境不可用。请先核对程序位置，再重新测试。'}
              </p>
            </div>
            <details className="mt-4 text-xs text-rex-text-muted">
              <summary className="cursor-pointer">技术详情（示例）</summary>
              <pre className="mt-3 overflow-auto rounded-lg bg-rex-panel p-3">spawn browser-command ENOENT</pre>
            </details>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => {
                  onRecovered();
                  record({
                    id: crypto.randomUUID(),
                    title: '浏览器服务重新测试通过',
                    detail: '原型模拟 · Codex · 用户级',
                    tone: 'ok',
                  });
                }}
                disabled={recovered}
              >
                <RotateCcw size={14} />
                {recovered ? '已展示恢复结果' : '模拟修复并重试'}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-xl bg-rex-panel p-4 text-sm">
            <p>{services[diagnostic ?? 0]?.detail}</p>
            <Badge tone={services[diagnostic ?? 0]?.result ? RESULT[services[diagnostic ?? 0].result].tone : 'neutral'}>
              {services[diagnostic ?? 0]?.result ? RESULT[services[diagnostic ?? 0].result].label : '尚未测试'}
            </Badge>
            <p className="text-xs leading-6 text-rex-text-muted">
              配置记录不代表实时连接。此详情属于当前选择的服务；原型未启动真实程序。
            </p>
          </div>
        )}
      </Modal>
      {open && (
        <McpWizard
          project={project}
          onClose={() => setOpen(false)}
          onFinish={(item) => {
            if (item.result !== 'conflict') setAdded((previous) => [...previous, item]);
            record({
              id: crypto.randomUUID(),
              title: `${item.result === 'conflict' ? '未写入服务' : '添加服务'}：${item.name}`,
              detail: `原型模拟 · ${item.scope} · ${RESULT[item.result].label}`,
              tone: item.result === 'failed' || item.result === 'conflict' ? 'warn' : 'neutral',
            });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
