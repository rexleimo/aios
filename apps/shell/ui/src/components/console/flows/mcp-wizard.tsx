'use client';

import { t } from '../../../i18n/t.mjs';
import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  FileCode2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { clientLabel, type ConsoleFacts } from '../../../lib/console-facts';
import { Badge, Button, Field, Input, Modal } from '../console-ui';
import { createMcpInstallFlow } from './mcp-install-flow';

const STEP_LABELS = [t("选择落点"), t("服务配置"), t("预览（真实 dry-run）")];

export interface McpPreset {
  name: string;
  entry: { command: string; args: string[] };
  requiredEnv: string[];
  description: string;
  costNotice: string;
}

export function McpWizard({
  facts,
  onClose,
  onDone,
  preset,
}: {
  facts: ConsoleFacts;
  onClose: () => void;
  onDone: () => void;
  preset?: McpPreset;
}) {
  const installed = facts.clients.filter((client) => client.installed);
  // 落点候选来自刚读回来的事实，不是这个文件里的常量：writable 为假的落点直接不进候选。
  const landingOptions = installed.flatMap((client) =>
    client.scopes
      .filter((scope) => scope.writable)
      .map((scope) => ({
        key: `${client.clientId}/${scope.scope}`,
        clientId: client.clientId,
        scope: scope.scope,
        file: scope.file,
        entryPath: scope.format,
      })),
  );
  const [step, setStep] = useState(0);
  const [landingKey, setLandingKey] = useState(landingOptions[0]?.key ?? '');
  const [name, setName] = useState(preset?.name ?? '');
  const [command, setCommand] = useState(preset?.entry.command ?? 'npx');
  const [args, setArgs] = useState<string[]>(preset?.entry.args ?? ['-y']);
  const [env, setEnv] = useState({ key: '', value: '' });
  const [showEnv, setShowEnv] = useState(false);
  const router = useRouter();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const [flow] = useState(() => createMcpInstallFlow({ changed: render, refresh: () => router.refresh() }));
  const state = flow.snapshot();
  const { preview, error: failure } = state;
  const running = state.phase === 'previewing' || state.phase === 'installing';

  const landing = landingOptions.find((option) => option.key === landingKey) ?? null;
  const entry: Record<string, unknown> = { type: 'stdio', command: command.trim(), args: args.filter((arg) => arg !== '') };
  if (!preset && env.key.trim() && env.value) entry.env = { [env.key.trim()]: env.value };
  const signature = JSON.stringify([landingKey, name, entry, landingOptions]);
  useEffect(() => { flow.invalidate(); }, [flow, signature]);
  useEffect(() => { flow.activate(); return () => flow.dispose(); }, [flow]);
  const expiresAt = preview?.preview?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => flow.expire(), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [flow, expiresAt]);

  const nameValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name.trim());
  const stepValid = step === 0 ? Boolean(landing) : step === 1 ? nameValid && command.trim().length > 0 : true;

  async function runPreview() {
    if (!landing) return;
    setStep(2);
    await flow.preview({ client: landing.clientId, scope: landing.scope, name: name.trim(), entry });
  }

  const payload = state.outcome?.result ?? preview?.result;
  function close(done = false) { flow.invalidate(); router.refresh(); if (done) onDone(); else onClose(); }

  return (
    <Modal
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      wide
      title={t("添加 MCP 服务")}
      description={t("第三步跑真实 `aios mcp add --dry-run`：它不改文件，只告诉你打算写什么。真正写入需要你单独授权。")}
    >
      <ol className="mb-7 flex items-center justify-between gap-2 border-b border-rex-border pb-5">
        {STEP_LABELS.map((label, index) => (
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
        <div className="space-y-4">
          {landingOptions.length === 0 ? (
            <p className="text-sm text-rex-text-muted">
              
              {t("本机没有可写的落点，所以这一步没法继续。每个落点的读取结果见服务清单。")}
            </p>
          ) : (
            <>
              <h3 className="text-sm font-medium">{t("写进哪个落点？")}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {landingOptions.map((option) => (
                  <label
                    key={option.key}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${option.key === landingKey ? 'border-rex-cyan bg-rex-cyan/5' : 'border-rex-border'}`}
                  >
                    <input
                      type="radio"
                      name="landing"
                      checked={option.key === landingKey}
                      onChange={() => setLandingKey(option.key)}
                      className="mt-1 accent-rex-cyan"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {clientLabel(option.clientId).name} · {option.scope}
                      </span>
                      <span className="mt-1 block break-all font-rex-mono text-[10px] text-rex-text-muted">
                        {option.file}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-rex-text-muted">
                
                {t("不可写的落点没有出现在上面——它们来自")} <code>aios mcp list</code>  {t("的")} <code>writable</code>  {t("字段，不是这个页面自己判断的。")}
              </p>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {preset && <div className="space-y-2 rounded-rex-md border border-rex-orange/30 p-3 text-xs leading-6">
            <p>{preset.description}</p>
            <p>{preset.costNotice}</p>
            <p>{t("请在启动客户端的环境中设置")} {preset.requiredEnv.join('、')}{t("，由 MCP 服务进程继承。不要在此填写密钥；预览和安装不会调用付费接口。")}</p>
          </div>}
          <Field label={t("服务名称")} hint={t("字母数字开头，可含 . _ -，最长 64；这个名字也是配置里的键")}>
            <Input
              aria-label={t("服务名称")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("例如：my-browser")}
            />
          </Field>
          {!nameValid && name.trim() !== '' && (
            <p role="alert" className="text-xs text-rex-danger">
              
              {t("这个名字不符合 CLI 的字符集，执行时会被拒绝——所以现在就不让你往下走。")}
            </p>
          )}
          <Field label={t("启动程序")} hint={t("连接方式：本地命令（stdio）。")}>
            <Input
              aria-label={t("启动程序")}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </Field>
          <div>
            <h3 className="mb-2 text-sm font-medium">{t("启动参数")}</h3>
            <div className="space-y-2">
              {args.map((arg, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label={t("参数 {value0}", { value0: index + 1 })}
                    value={arg}
                    onChange={(event) =>
                      setArgs((previous) => previous.map((value, at) => (at === index ? event.target.value : value)))
                    }
                    className="font-rex-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("移除参数 {value0}", { value0: index + 1 })}
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
              
              {t("＋ 添加参数")}
            </button>
            <p className="mt-2 text-xs text-rex-text-muted">{t("每项是一个完整参数，包含空格的路径也不会被拆开。")}</p>
          </div>
          {!preset && <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("环境变量（可选）")}</legend>
            <div className="flex gap-2">
              <Input
                aria-label={t("环境变量名称")}
                placeholder={t("变量名")}
                value={env.key}
                onChange={(event) => setEnv((previous) => ({ ...previous, key: event.target.value }))}
              />
              <Input
                aria-label={t("环境变量值")}
                type={showEnv ? 'text' : 'password'}
                placeholder={t("变量值")}
                value={env.value}
                onChange={(event) => setEnv((previous) => ({ ...previous, value: event.target.value }))}
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-rex-text-muted">
              <input type="checkbox" checked={showEnv} onChange={(event) => setShowEnv(event.target.checked)} className="size-3.5 accent-rex-cyan" />
              
              {t("显示变量值")}
            </label>
          </fieldset>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-rex-cyan/5 p-3 text-xs leading-5 text-rex-text-body">
            <ShieldCheck size={16} className="shrink-0 text-rex-cyan" />
            
            {t("预览只读；只有安全预览后单独授权才会写入。预览和安装都不调用付费接口。")}
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-3 rounded-xl border border-rex-border p-4 text-sm">
            <dt className="text-rex-text-muted">{t("命令")}</dt>
            <dd className="break-all font-rex-mono text-[11px]">{preview?.argv?.join(' ') ?? t("未执行")}</dd>
            <dt className="text-rex-text-muted">{t("退出码")}</dt>
            <dd className="font-rex-mono text-xs">{state.outcome?.exitCode ?? preview?.exitCode ?? '—'}</dd>
            <dt className="text-rex-mono text-rex-text-muted">{t("打算写入")}</dt>
            <dd className="break-all text-xs">
              {payload?.landing?.file ?? landing?.file ?? '—'}
              {payload?.planned?.entryPath ? ` → ${payload.planned.entryPath}` : ''}
              {typeof payload?.planned?.bytes === 'number' ? t(" · 配置现共 {value0} 字节", { value0: payload.planned.bytes }) : ''}
            </dd>
            <dt className="text-rex-text-muted">{t("当前状态")}</dt>
            <dd className="text-xs">
              {payload?.classification?.status ?? t("未知")}
              {payload?.status ? t(" · 命令结论 {value0}", { value0: payload.status }) : ''}
            </dd>
            <dt className="text-rex-text-muted">{t("服务")}</dt>
            <dd className="break-all font-medium">{name.trim()}</dd>
            <dt className="text-rex-text-muted">{t("程序")}</dt>
            <dd className="break-all font-rex-mono text-xs">{command.trim()}</dd>
            <dt className="text-rex-text-muted">{t("参数")}</dt>
            <dd className="space-y-1">
              {args.filter((arg) => arg !== '').map((arg, index) => (
                <code key={index} className="block break-all rounded bg-rex-panel px-2 py-1 text-xs">
                  {JSON.stringify(arg)}
                </code>
              ))}
            </dd>
            {env.key.trim() && (
              <>
                <dt className="text-rex-text-muted">{t("环境变量")}</dt>
                <dd className="flex items-center gap-1 text-xs">
                  <LockKeyhole size={12} />
                  {env.key.trim()}  {t("· 值已隐藏")}
                </dd>
              </>
            )}
          </dl>
          {failure && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rex-danger/40 p-4 text-xs leading-5 text-rex-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{failure}</span>
            </div>
          )}
          {payload?.reason && payload.reason !== failure && (
            <p className="text-xs leading-5 text-rex-text-muted">{t("命令给出的原因：")}{payload.reason}</p>
          )}
          <div className="rounded-xl border border-rex-border p-4 text-xs leading-6 text-rex-text-muted">
            <h3 className="mb-2 flex items-center gap-2 font-medium text-rex-text-body">
              <FileCode2 size={15} />
              {state.phase === 'done' ? t("安装完成") : state.phase === 'installing' ? t("正在安装，请等待结果") : t("写入授权与结果")}
            </h3>
            <p>
              
              {t("安装复用 CLI 的归属检查、写前备份与记账失败回滚；过期预览或配置变化会拒绝写入。失败后必须重新预览和授权。")}
            </p>
            {state.phase === 'preview' && <label className="mt-3 flex items-start gap-2 text-rex-text-body">
              <input type="checkbox" checked={state.consent} onChange={(event) => flow.approve(event.target.checked)} className="mt-1 accent-rex-cyan" />
              
              {t("我确认允许 AIOS 将此 MCP 服务写入所选客户端配置文件")}
            </label>}
            {payload?.backupPath && <p className="break-all">{t("备份：")}{payload.backupPath}</p>}
            {payload?.rolledBack && <p>{t("回滚结果：")}{payload.rolledBack}</p>}
            {state.phase === 'done' && <p role="status">{payload?.status}  {t("· 服务清单已刷新；这不代表已验证客户端启动或密钥可用。")}</p>}
          </div>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between border-t border-rex-border pt-5">
        <Button variant="ghost" disabled={running} onClick={() => { flow.invalidate(); if (step > 0) setStep(step - 1); else close(); }}>
          <ArrowLeft size={14} />
          {step > 0 ? t("上一步") : t("关闭")}
        </Button>
        {step < 2 ? (
          <Button
            disabled={!stepValid || running}
            onClick={() => {
              if (step === 1) void runPreview();
              else setStep(step + 1);
            }}
          >
            {running ? <CircleDashed size={14} className="animate-spin" /> : null}
            {step === 1 ? (running ? t("执行中") : t("跑真实 dry-run 预览")) : t("下一步")}
            <ArrowRight size={14} />
          </Button>
        ) : (
          <div className="flex gap-2">
            {state.phase !== 'done' && <Button disabled={running || !flow.canInstall()} onClick={() => void flow.install()}>
              {running ? <CircleDashed size={14} className="animate-spin" /> : <FileCode2 size={14} />}{t("安装服务")}
            </Button>}
            <Button variant="outline" disabled={running} onClick={() => close(state.phase === 'done')}>
              <Badge tone="neutral">{state.phase === 'done' ? t("已安装") : t("未完成")}</Badge>{t("返回服务清单")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
