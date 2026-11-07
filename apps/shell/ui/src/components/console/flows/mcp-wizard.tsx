'use client';

import { useState } from 'react';
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
import { Badge, Button, Field, Modal, fieldClass } from '../console-ui';

/** `mcp.action.v1` 里预览要如实转述的字段。 */
interface ActionPayload {
  status?: string;
  classification?: { status?: string; desiredFingerprint?: string };
  planned?: { bytes?: number; createdBucket?: boolean; entryPath?: string; file?: string };
  landing?: { clientId?: string; scope?: string; file?: string; writable?: boolean };
  dryRun?: boolean;
  exitCode?: number;
  reason?: string;
  message?: string;
}

interface PostResult {
  ok: boolean;
  argv: string[];
  exitCode: number;
  result: ActionPayload | string | null;
  stderr: string;
  httpStatus: number;
  error?: string;
  /** 路由在 400/409 时给出的可执行原因（例：缺 confirm、字段不合法）。 */
  detail?: string;
}

const STEP_LABELS = ['选择落点', '服务配置', '预览（真实 dry-run）'];

export function McpWizard({
  facts,
  onClose,
  onDone,
}: {
  facts: ConsoleFacts;
  onClose: () => void;
  onDone: () => void;
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
  const [name, setName] = useState('');
  const [command, setCommand] = useState('npx');
  const [args, setArgs] = useState<string[]>(['-y']);
  const [env, setEnv] = useState({ key: '', value: '' });
  const [showEnv, setShowEnv] = useState(false);
  const [preview, setPreview] = useState<PostResult | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const landing = landingOptions.find((option) => option.key === landingKey) ?? null;
  const entry: Record<string, unknown> = { type: 'stdio', command: command.trim(), args: args.filter((arg) => arg !== '') };
  if (env.key.trim() && env.value) entry.env = { [env.key.trim()]: env.value };

  const nameValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(name.trim());
  const stepValid = step === 0 ? Boolean(landing) : step === 1 ? nameValid && command.trim().length > 0 : true;

  /** 第三步跑的是真实命令：`aios mcp add … --dry-run --json`。实测它不改一个字节。 */
  async function runPreview() {
    if (!landing) return;
    setRunning(true);
    setFailure(null);
    setPreview(null);
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          client: landing.clientId,
          scope: landing.scope,
          name: name.trim(),
          entry,
          dryRun: true,
        }),
      });
      const payload = (await response.json()) as PostResult;
      payload.httpStatus = response.status;
      setPreview(payload);
      if (payload.error) setFailure(`${payload.error}${payload.detail ? `：${payload.detail}` : ''}`);
      setStep(2);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  const payload = preview && typeof preview.result === 'object' ? (preview.result as ActionPayload) : null;

  return (
    <Modal
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      wide
      title="添加 MCP 服务"
      description="第三步跑真实 `aios mcp add --dry-run`：它不改文件，只告诉你打算写什么。真正写入需要你单独授权。"
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
              本机没有可写的落点，所以这一步没法继续。每个落点的读取结果见服务清单。
            </p>
          ) : (
            <>
              <h3 className="text-sm font-medium">写进哪个落点？</h3>
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
                不可写的落点没有出现在上面——它们来自 <code>aios mcp list</code> 的 <code>writable</code> 字段，不是这个页面自己判断的。
              </p>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field label="服务名称" hint="字母数字开头，可含 . _ -，最长 64；这个名字也是配置里的键">
            <input
              aria-label="服务名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              placeholder="例如：my-browser"
            />
          </Field>
          {!nameValid && name.trim() !== '' && (
            <p role="alert" className="text-xs text-rex-danger">
              这个名字不符合 CLI 的字符集，执行时会被拒绝——所以现在就不让你往下走。
            </p>
          )}
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
            上面这一步是真实执行的 <code>--dry-run</code>。文件没有被修改；下面全部是命令自己的回答。
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-3 rounded-xl border border-rex-border p-4 text-sm">
            <dt className="text-rex-text-muted">命令</dt>
            <dd className="break-all font-rex-mono text-[11px]">{preview?.argv.join(' ') ?? '未执行'}</dd>
            <dt className="text-rex-text-muted">退出码</dt>
            <dd className="font-rex-mono text-xs">{preview?.exitCode ?? '—'}</dd>
            <dt className="text-rex-mono text-rex-text-muted">打算写入</dt>
            <dd className="break-all text-xs">
              {payload?.planned?.file ?? landing?.file ?? '—'}
              {payload?.planned?.entryPath ? ` → ${payload.planned.entryPath}` : ''}
              {typeof payload?.planned?.bytes === 'number' ? ` · 配置现共 ${payload.planned.bytes} 字节` : ''}
            </dd>
            <dt className="text-rex-text-muted">当前状态</dt>
            <dd className="text-xs">
              {payload?.classification?.status ?? '未知'}
              {payload?.status ? ` · 命令结论 ${payload.status}` : ''}
            </dd>
            <dt className="text-rex-text-muted">服务</dt>
            <dd className="break-all font-medium">{name.trim()}</dd>
            <dt className="text-rex-text-muted">程序</dt>
            <dd className="break-all font-rex-mono text-xs">{command.trim()}</dd>
            <dt className="text-rex-text-muted">参数</dt>
            <dd className="space-y-1">
              {args.filter((arg) => arg !== '').map((arg, index) => (
                <code key={index} className="block break-all rounded bg-rex-panel px-2 py-1 text-xs">
                  {JSON.stringify(arg)}
                </code>
              ))}
            </dd>
            {env.key.trim() && (
              <>
                <dt className="text-rex-text-muted">环境变量</dt>
                <dd className="flex items-center gap-1 text-xs">
                  <LockKeyhole size={12} />
                  {env.key.trim()} · 值已隐藏
                </dd>
              </>
            )}
          </dl>
          {failure && (
            <div className="flex gap-2 rounded-xl border border-rex-danger/40 p-4 text-xs leading-5 text-rex-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{failure}</span>
            </div>
          )}
          {payload?.reason && (
            <p className="text-xs leading-5 text-rex-text-muted">命令给出的原因：{payload.reason}</p>
          )}
          <div className="rounded-xl border border-rex-border p-4 text-xs leading-6 text-rex-text-muted">
            <h3 className="mb-2 flex items-center gap-2 font-medium text-rex-text-body">
              <FileCode2 size={15} />
              真正写入这一步还没有接上
            </h3>
            <p>
              写入需要三件还没到位的东西：写前备份、失败即回滚、以及你对「这个产品可以改我的配置文件」的明确授权。
              这三条到位之前，按钮不存在，而不是存在但不干活。
            </p>
          </div>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between border-t border-rex-border pt-5">
        <Button variant="ghost" onClick={() => (step > 0 ? setStep(step - 1) : onClose())}>
          <ArrowLeft size={14} />
          {step > 0 ? '上一步' : '关闭'}
        </Button>
        {step < 2 ? (
          <Button
            disabled={!stepValid}
            onClick={() => {
              if (step === 1) void runPreview();
              else setStep(step + 1);
            }}
          >
            {running ? <CircleDashed size={14} className="animate-spin" /> : null}
            {step === 1 ? (running ? '执行中' : '跑真实 dry-run 预览') : '下一步'}
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button variant="outline" onClick={onDone}>
            <Badge tone="neutral">只读预览</Badge>
            返回服务清单
          </Button>
        )}
      </div>
    </Modal>
  );
}
