'use client';

import { t } from '../../../i18n/t.mjs';
// 网关控制卡：把「启停网关」与「接入客户端」从折叠说明里提升为可见、可操作的界面。
// 启停/接入/还原都是有副作用的操作 → 先弹确认（Modal），再 POST confirm:true；状态只读，2.5s 轮询且仅在激活时。
// 接入默认 magpie 式「就地」：一键把网关地址写进客户端真实配置（备份原值、可还原），普通命令即走网关；
// 隔离模式（特殊启动命令）降为可折叠兜底。全部走共享件，不另写一套表面。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';
import { clientLabel } from '../../../lib/console-facts';
import type { NavId } from '../../../lib/console-navigation';
import { Badge, Button, InlineFeedback, Modal, Panel, SmallTitle, type Feedback } from '../console-ui';
import { AgentAccessPanel } from './agent-access-panel';
import { GatewaySetupGuide, type GuideActionKind } from './gateway-setup-guide';

interface GatewayClient {
  client: string;
  connected: boolean;
  launch: string;
  mode: string;
  artifactExists: boolean;
}
export interface GatewayStatus {
  running: boolean;
  managed: boolean;
  stale: boolean;
  pid: number | null;
  port: number;
  url: string;
  connected: boolean;
  clients: GatewayClient[];
  configuredReady?: boolean;
  configuredModelCount?: number;
  configuredRevision?: string | null;
  ready?: boolean;
  configuredModels?: number;
  readyModels?: number;
  code?: string;
  generationVerified?: boolean;
}

type ConnectConfirmation = { kind: 'connect'; client: string; port: number; expectedRevision: string; target: string } | { kind: 'disconnect'; client: string };
type ConfirmState = { kind: 'start' | 'stop' } | ConnectConfirmation;
type Busy = 'start' | 'stop' | 'connect' | 'disconnect' | null;

const POLL_MS = 2500;
export function GatewayControl({ active, navigate }: { active: boolean; navigate?: (view: NavId) => void }) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [connectFeedback, setConnectFeedback] = useState<Feedback | null>(null);
  const inFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/model-routing/gateway');
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || t("读取失败"));
      setStatus(body as GatewayStatus);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadStatus();
    const timer = setInterval(() => void loadStatus(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, loadStatus]);

  async function runAction(action: 'start' | 'stop') {
    setConfirm(null);
    setBusy(action);
    setFeedback(null);
    try {
      const res = await fetch('/api/model-routing/gateway', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, confirm: true, ...(action === 'start' ? { port: status?.port } : {}) }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        const detail = body.result?.error || body.stderr || body.detail || body.error || t("操作失败");
        setFeedback({ text: t("{value0}失败：{detail}", { value0: action === 'start' ? t("启动") : t("关闭"), detail: detail }), tone: 'error' });
      } else {
        const result = body.result ?? {};
        const text = action === 'start'
          ? (result.alreadyRunning ? t("网关已在 {value0} 运行", { value0: result.url }) : t("网关已启动：{value0}", { value0: result.url }))
          : (result.stopped ? t("网关已关闭") : t("网关未关闭：{value0}", { value0: result.reason || t("未知") }));
        setFeedback({ text, tone: result.stopped === false && action === 'stop' ? 'error' : 'ok' });
      }
    } catch (err) {
      setFeedback({ text: t("{value0}失败：{value1}", { value0: action === 'start' ? t("启动") : t("关闭"), value1: err instanceof Error ? err.message : String(err) }), tone: 'error' });
    } finally {
      setBusy(null);
      await loadStatus();
    }
  }

  async function runConnectAction(approved: ConnectConfirmation) {
    const { kind: action, client } = approved;
    setConfirm(null);
    setBusy(action);
    setConnectFeedback(null);
    const name = clientLabel(client).name;
    try {
      const res = await fetch('/api/model-routing/gateway', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, confirm: true, client, ...(approved.kind === 'connect' ? { port: approved.port, expectedRevision: approved.expectedRevision, target: approved.target } : {}) }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        const detail = body.result?.error || body.stderr || body.detail || body.error || t("操作失败");
        setConnectFeedback({ text: t("{value0}失败：{detail}", { value0: action === 'connect' ? t("接入") : t("还原"), detail: detail }), tone: 'error' });
      } else {
        const result = body.result ?? {};
        const text = action === 'connect'
          ? t("{name} 已接入，普通命令即走网关", { name: name })
          : (result.disconnected ? t("{name} 已还原到接入前", { name: name }) : t("{name} 未还原：{value1}", { name: name, value1: result.reason || t("未知") }));
        setConnectFeedback({ text, tone: result.disconnected === false && action === 'disconnect' ? 'error' : 'ok' });
      }
    } catch (err) {
      setConnectFeedback({ text: t("{value0}失败：{value1}", { value0: action === 'connect' ? t("接入") : t("还原"), value1: err instanceof Error ? err.message : String(err) }), tone: 'error' });
    } finally {
      setBusy(null);
      await loadStatus();
    }
  }

  const pending = status === null;
  const running = status?.running ?? false;
  const managed = status?.managed ?? false;
  const canStop = running && managed;
  const ready = running && status?.ready === true;
  const validRevision = typeof status?.configuredRevision === 'string' && /^[a-f0-9]{64}$/u.test(status.configuredRevision);
  const canConnect = ready && validRevision && Number.isInteger(status?.port) && Number(status?.port) > 0 && Number(status?.port) < 65536;
  const readinessText = pending
    ? t("尚未读取")
    : !running
    ? t("网关未运行")
    : ready
      ? t("可路由 {value0} 个模型", { value0: status?.readyModels ?? status?.configuredModels ?? 0 })
      : status?.code === 'gateway-readiness-unavailable'
        ? t("监听已启动，但无法确认已加载模型的就绪状态")
      : status?.code === 'PROVIDER_CREDENTIALS_MISSING'
        ? t("监听已启动，但模型来源缺少有效凭据")
      : status?.code === 'PROVIDER_CONFIG_INVALID'
        ? t("监听已启动，但加载的供应商配置无效")
      : status?.configuredModels === 0
        ? t("监听已启动，但尚无模型访问配置")
      : status?.code === 'NO_ROUTE_CONFIGURED' && Number(status?.readyModels) > 1
        ? t("监听已启动，多模型仍需显式默认或角色策略")
        : t("监听已启动，但当前没有就绪模型");
  const restoreNotice = !running && status?.connected
    ? t("有客户端仍指向网关。请启动网关或还原客户端，否则它们可能无法发送请求。")
    : '';
  const processNotice = pending
    ? t("尚未读到进程和接入状态，当前无法确认网关是否运行。")
    : status?.stale
      ? t("发现残留进程记录，但端口未响应，不能判定网关正在运行；重新启动时会检查进程状态。{restoreNotice}", { restoreNotice: restoreNotice })
      : running && !managed
        ? t("这个网关由外部前台进程启动，界面无法停机；请在启动它的终端按 Ctrl+C。aios model-router gateway-stop 仅对托管进程有效。")
        : running
          ? t("界面托管进程 pid {value0}。停止网关不会自动还原客户端配置。", { value0: status?.pid })
          : restoreNotice || t("网关尚未启动。启动监听不会自动接入客户端，也不会自动配置模型。");

  const confirmMeta = (() => {
    if (!confirm) return { title: '', description: '' };
    if (confirm.kind === 'start') return { title: t("启动本地网关？"), description: t("将在本机 {value0} 启动一个常驻网关进程，接入的客户端会开始把请求交给它路由。只绑 127.0.0.1，密钥仍只存环境变量。", { value0: status?.url }) };
    if (confirm.kind === 'stop') return { title: t("关闭本地网关？"), description: t("将停止界面托管的网关进程，接入的客户端在网关重新启动前无法路由请求。") };
    if (confirm.kind === 'connect') {
      const name = clientLabel(confirm.client).name;
      return { title: t("接入 {name}？", { name: name }), description: t("将把 http://127.0.0.1:{value0} 写进 {name} 的真实配置（只改网关需要的 key，自动备份原值），默认目标 {value2}。按本次确认的目录版本接入；目录变化时需刷新并重新确认。之后普通 {name_3} 命令即走网关。可随时一键还原。", { value0: confirm.port, name: name, value2: confirm.target, name_3: name }) };
    }
    if (confirm.kind === 'disconnect') {
      const name = clientLabel(confirm.client).name;
      return { title: t("还原 {name}？", { name: name }), description: t("将把 {name} 的配置还原到接入前的原值（移除我们写入的 key，恢复你原来的设置）。", { name: name }) };
    }
    return { title: '', description: '' };
  })();

  function onConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'connect' || confirm.kind === 'disconnect') void runConnectAction(confirm);
    else void runAction(confirm.kind);
  }

  const onGuideAction = (kind: GuideActionKind) => {
    if (kind === 'start') setConfirm({ kind: 'start' });
    else if (kind === 'providers') navigate?.('routing');
    else if (kind === 'connect') {
      const first = status?.clients.find((item) => !item.connected);
      if (first && canConnect && status?.configuredRevision) setConfirm({ kind: 'connect', client: first.client, port: status.port, expectedRevision: status.configuredRevision, target: 'auto' });
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      <GatewaySetupGuide
        status={status}
        pending={pending}
        busy={busy !== null}
        error={error}
        canConnect={canConnect}
        onAction={onGuideAction}
      />
      <Panel className="min-w-0 p-6">
        <SmallTitle
          action={
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
              <Badge className="w-24 justify-center" tone={status?.stale ? 'warn' : running ? 'ok' : 'neutral'}>
                {pending ? t("状态未知") : running ? t("运行中") : status?.stale ? t("进程记录已失效") : t("未运行")}
              </Badge>
              <Button
                variant={running ? 'outline' : 'default'}
                size="sm"
                className="w-28 justify-start"
                disabled={pending || busy !== null || !!error || (running && !canStop)}
                onClick={() => setConfirm({ kind: running ? 'stop' : 'start' })}
              >
                <Power size={14} className="shrink-0" />
                <span className="flex-1 text-center">{pending ? t("读取状态中") : busy ? t("处理中…") : running ? t("关闭网关") : t("启动网关")}</span>
              </Button>
            </div>
          }
        >
          
          {t("本地网关")}
        </SmallTitle>
        <p className="text-xs leading-6 text-rex-text-muted">
          
          {t("监听地址")} <code className="inline-block w-52 max-w-full truncate rounded bg-rex-panel px-1 py-0.5 align-bottom font-rex-mono" title={status?.url}>{status?.url || t("正在读取…")}</code>
          {' · '}{t("启动加载配置，改配置后需重启。")}
        </p>
        <p className="mt-2 min-h-20 break-words text-[11px] leading-5 text-rex-text-muted sm:min-h-15">{processNotice}</p>
        <Panel className="mt-3 space-y-2 bg-rex-panel/40 p-3 text-xs leading-5">
          <Badge className="min-h-11 w-full whitespace-normal leading-5" tone={pending ? 'neutral' : ready ? 'ok' : 'warn'}>{t("运行时就绪：")}{readinessText}</Badge>
          <p className="text-rex-text-muted">{t("已保存配置：")}{status?.configuredModelCount === undefined ? t("尚未读取") : t("{value0} 个显式绑定模型", { value0: status.configuredModelCount })}{t("。改配置后需重启网关加载。")}</p>
        </Panel>
        <div className="mt-3 min-h-12 break-words text-[11px] leading-5">
          {error ? <>
            <span className="text-rex-danger">{pending ? t("状态读取失败") : t("刷新失败")}：{error}</span>
            <Button className="ml-2" size="sm" variant="ghost" onClick={() => void loadStatus()}>{t("重试")}</Button>
          </> : <InlineFeedback feedback={feedback} idle={t("启停会在本机绑定/释放 127.0.0.1 端口，操作前需确认。")} />}
        </div>
      </Panel>

      <AgentAccessPanel
        status={status}
        canConnect={canConnect}
        busy={busy !== null}
        error={error}
        feedback={connectFeedback}
        onConnect={(client, target) => {
          if (canConnect && status?.configuredRevision) setConfirm({ kind: 'connect', client, port: status.port, expectedRevision: status.configuredRevision, target });
        }}
        onDisconnect={(client) => setConfirm({ kind: 'disconnect', client })}
        onNavigate={(view) => navigate?.(view)}
      />

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirmMeta.title}
        description={confirmMeta.description}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>{t("取消")}</Button>
          <Button variant={confirm?.kind === 'stop' || confirm?.kind === 'disconnect' ? 'danger' : 'default'} onClick={onConfirm}>
            <Power size={14} />
            {confirm?.kind === 'start' ? t("确认启动") : confirm?.kind === 'stop' ? t("确认关闭") : confirm?.kind === 'connect' ? t("确认接入") : t("确认还原")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
