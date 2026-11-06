'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCode2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { TOOLS, type DemoProject } from '../demo-data';
import { Badge, Button, Field, Modal, fieldClass } from '../console-ui';
import { RESULT, type ServiceResult } from './service-state';

export function McpWizard({
  project,
  onClose,
  onFinish,
}: {
  project: DemoProject;
  onClose: () => void;
  onFinish: (item: { name: string; tools: string[]; scope: string; result: ServiceResult }) => void;
}) {
  // Freeze the target project for the lifetime of this operation.
  const [target] = useState(project);
  const [step, setStep] = useState(0);
  const [tools, setTools] = useState(['claude']);
  const [scope, setScope] = useState('home');
  const [name, setName] = useState('项目浏览器');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState(['-y', '@playwright/mcp@latest']);
  const [env, setEnv] = useState({ key: '', value: '' });
  const [scenario, setScenario] = useState('failed');
  const [result, setResult] = useState<ServiceResult>('written');
  const [showEnv, setShowEnv] = useState(false);
  const scopeLabel = scope === 'home' ? '此用户下的所有项目' : `仅项目 ${target.name}`;
  const valid =
    step === 0
      ? tools.length > 0 && (scope !== 'project' || target.status === 'ready')
      : name.trim().length > 0 && command.trim().length > 0 && (!env.value || !!env.key.trim());
  const stepLabels = ['选择目标', '服务配置', '预览变更', '查看结果'];
  function toggleTool(id: string) {
    setTools((previous) => (previous.includes(id) ? previous.filter((tool) => tool !== id) : [...previous, id]));
  }
  return (
    <Modal
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      wide
      title="添加 MCP 服务"
      description="这是交互原型：所有写入与连接测试均为模拟，配置不会真正更改。"
    >
      <ol className="mb-7 flex items-center justify-between gap-2 border-b border-rex-border pb-5">
        {stepLabels.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2 text-xs ${step === index ? 'font-semibold text-rex-cyan' : 'text-rex-text-muted'}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full border ${step === index ? 'border-rex-cyan bg-rex-cyan/5' : 'border-rex-border'}`}
            >
              {step > index ? <Check size={12} /> : index + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-medium">哪些工具使用这个服务？</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${tools.includes(tool.id) ? 'border-rex-cyan bg-rex-cyan/5' : 'border-rex-border'}`}
                >
                  <input
                    type="checkbox"
                    checked={tools.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="accent-rex-cyan"
                  />
                  {tool.name}
                </label>
              ))}
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-3 text-sm font-medium">在哪里生效？</legend>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-rex-border p-4">
              <input
                type="radio"
                name="scope"
                checked={scope === 'home'}
                onChange={() => setScope('home')}
                className="mt-1 accent-rex-cyan"
              />
              <span>
                <span className="block text-sm font-medium">此用户下的所有项目</span>
                <span className="mt-1 block text-xs text-rex-text-muted">写入所选工具的用户配置</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-rex-border p-4">
              <input
                type="radio"
                name="scope"
                checked={scope === 'project'}
                onChange={() => setScope('project')}
                className="mt-1 accent-rex-cyan"
              />
              <span>
                <span className="block text-sm font-medium">仅项目 {target.name}</span>
                <span className="mt-1 block break-all text-xs text-rex-text-muted">{target.path}</span>
              </span>
            </label>
            {scope === 'project' && target.status !== 'ready' && (
              <p role="alert" className="text-xs text-rex-danger">
                项目不可访问，请先重新定位，或使用用户级配置。
              </p>
            )}
          </fieldset>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <Field label="服务名称">
            <input
              aria-label="服务名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="启动程序" hint="连接方式：本地命令（stdio）。">
            <input
              aria-label="启动程序"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <div>
            <h3 className="mb-2 text-sm font-medium">启动参数</h3>
            <div className="space-y-2">
              {args.map((arg, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    aria-label={`参数 ${index + 1}`}
                    value={arg}
                    onChange={(event) =>
                      setArgs((previous) => previous.map((value, at) => (at === index ? event.target.value : value)))
                    }
                    className={`${fieldClass} font-rex-mono text-xs`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`移除参数 ${index + 1}`}
                    onClick={() => setArgs((previous) => previous.filter((_, at) => at !== index))}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setArgs((previous) => [...previous, ''])}
              className="mt-2 rounded-md text-xs text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
            >
              ＋ 添加参数
            </button>
            <p className="mt-2 text-xs text-rex-text-muted">每项是一个完整参数，包含空格的路径也不会被拆开。</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">环境变量（可选）</legend>
            <div className="flex gap-2">
              <input
                aria-label="环境变量名称"
                placeholder="变量名"
                value={env.key}
                onChange={(event) => setEnv((previous) => ({ ...previous, key: event.target.value }))}
                className={fieldClass}
              />
              <input
                aria-label="环境变量值"
                type={showEnv ? 'text' : 'password'}
                placeholder="变量值"
                value={env.value}
                onChange={(event) => setEnv((previous) => ({ ...previous, value: event.target.value }))}
                className={fieldClass}
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-rex-text-muted">
              <input type="checkbox" checked={showEnv} onChange={(event) => setShowEnv(event.target.checked)} />
              显示变量值
            </label>
          </fieldset>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-rex-cyan/5 p-3 text-xs leading-5 text-rex-text-body">
            <ShieldCheck size={16} className="shrink-0 text-rex-cyan" />
            预览不会写入文件。确认后，结果仍会区分配置写入与连接测试。
          </div>
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-3 rounded-xl border border-rex-border p-4 text-sm">
            <dt className="text-rex-text-muted">服务</dt>
            <dd className="break-all font-medium">{name}</dd>
            <dt className="text-rex-text-muted">目标工具</dt>
            <dd>{tools.map((id) => TOOLS.find((tool) => tool.id === id)?.name).join('、')}</dd>
            <dt className="text-rex-text-muted">生效范围</dt>
            <dd>{scopeLabel}</dd>
            <dt className="text-rex-text-muted">程序</dt>
            <dd className="break-all font-rex-mono text-xs">{command}</dd>
            <dt className="text-rex-text-muted">参数</dt>
            <dd className="space-y-1">
              {args.map((arg, index) => (
                <code key={index} className="block break-all rounded bg-rex-panel px-2 py-1 text-xs">
                  {JSON.stringify(arg)}
                </code>
              ))}
            </dd>
            {env.key && (
              <>
                <dt className="text-rex-text-muted">环境变量</dt>
                <dd className="flex items-center gap-1 text-xs">
                  <LockKeyhole size={12} />
                  {env.key} · 值已隐藏
                </dd>
              </>
            )}
          </dl>
          <div className="rounded-xl border border-rex-border p-4">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-medium">
              <FileCode2 size={15} />
              将修改的配置（示例）
            </h3>
            {tools.map((id) => (
              <p key={id} className="mb-1 break-all font-rex-mono text-xs leading-5 text-rex-text-muted">
                {scope === 'home' ? '~/' : `${target.path}/`}
                {id === 'claude'
                  ? scope === 'home'
                    ? '.claude.json'
                    : '.mcp.json'
                  : id === 'codex'
                    ? '.codex/config.toml'
                    : '.gemini/settings.json'}
              </p>
            ))}
            <p className="mt-3 text-xs leading-5 text-rex-text-muted">
              正式执行将保留变更前备份；预览后文件发生变化时，应停止并让你重新检查。
            </p>
          </div>
          <Field label="体验一个结果场景">
            <select
              aria-label="结果场景"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              className={fieldClass}
            >
              <option value="failed">写入后连接失败 → 重试恢复</option>
              <option value="ok">写入后连接测试通过</option>
              <option value="conflict">预览后配置被外部修改 → 保护原文件</option>
            </select>
          </Field>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <div role="status" className="rounded-xl border border-rex-border p-5">
            <div className="mb-3 flex items-center gap-2">
              {result === 'passed' ? (
                <CheckCircle2 size={22} className="text-rex-green" />
              ) : result === 'written' ? (
                <CircleDashed size={22} className="text-rex-text-muted" />
              ) : (
                <AlertTriangle size={22} className="text-rex-danger" />
              )}
              <h3 className="font-semibold">{RESULT[result].label}</h3>
            </div>
            <p className="text-sm leading-6 text-rex-text-muted">
              {result === 'written'
                ? '示例配置步骤已完成。尚未测试连接，因此不能确认服务可用。'
                : result === 'passed'
                  ? '模拟测试已通过。这里没有启动真实程序。'
                  : result === 'conflict'
                    ? '配置在预览后发生变化。此次没有覆盖原文件，请重新检查变更。'
                    : '模拟程序未能启动。配置输入已保留，你可以修复后只重试连接。'}
            </p>
            <div className="mt-4 divide-y divide-rex-border">
              {tools.map((id) => (
                <div key={id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <span>{TOOLS.find((tool) => tool.id === id)?.name}</span>
                  <Badge tone={RESULT[result].tone}>{RESULT[result].label}</Badge>
                </div>
              ))}
            </div>
          </div>
          {result === 'written' && (
            <Button onClick={() => setResult(scenario === 'ok' ? 'passed' : 'failed')}>
              模拟连接测试
              <ArrowRight size={14} />
            </Button>
          )}
          {result === 'failed' && (
            <Button onClick={() => setResult('passed')}>
              <RotateCcw size={14} />
              模拟修复并重试连接
            </Button>
          )}
          {result === 'conflict' && (
            <Button variant="outline" onClick={() => setStep(2)}>
              返回检查变更
            </Button>
          )}
          <p className="text-xs leading-5 text-rex-text-muted">
            工具：{tools.map((id) => TOOLS.find((tool) => tool.id === id)?.name).join('、')}
            <br />
            范围：{scopeLabel}
            <br />
            全部结果为原型示例，未改动真实配置。
          </p>
        </div>
      )}
      <div className="mt-7 flex items-center justify-between border-t border-rex-border pt-5">
        <Button variant="ghost" onClick={() => (step > 0 && step < 3 ? setStep(step - 1) : onClose())}>
          <ArrowLeft size={14} />
          {step > 0 && step < 3 ? '上一步' : '关闭'}
        </Button>
        {step < 3 ? (
          <Button
            disabled={!valid}
            onClick={() => {
              if (step === 2) setResult(scenario === 'conflict' ? 'conflict' : 'written');
              setStep(step + 1);
            }}
          >
            {step === 2 ? '模拟执行' : '下一步'}
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button onClick={() => onFinish({ name: name.trim(), tools, scope: scopeLabel, result })}>完成体验</Button>
        )}
      </div>
    </Modal>
  );
}
