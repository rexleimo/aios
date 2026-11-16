'use client';

// 网关控制卡：把「启停网关」与「接入客户端」从折叠说明里提升为可见、可操作的界面。
// 启停/接入/还原都是有副作用的操作 → 先弹确认（Modal），再 POST confirm:true；状态只读，2.5s 轮询且仅在激活时。
// 接入默认 magpie 式「就地」：一键把网关地址写进客户端真实配置（备份原值、可还原），普通命令即走网关；
// 隔离模式（特殊启动命令）降为可折叠兜底。全部走共享件，不另写一套表面。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Plug, Power, Terminal } from 'lucide-react';
import { clientLabel } from '../../../lib/console-facts';
import { Badge, Button, InlineFeedback, Modal, Panel, SmallTitle, type Feedback } from '../console-ui';

interface GatewayClient {
  client: string;
  connected: boolean;
  launch: string;
  mode: string;
  artifactExists: boolean;
}
interface GatewayStatus {
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
  ready?: boolean;
  configuredModels?: number;
  readyModels?: number;
  code?: string;
  generationVerified?: boolean;
}

type ConfirmState = { kind: 'start' | 'stop' } | { kind: 'connect' | 'disconnect'; client: string };
type Busy = 'start' | 'stop' | 'connect' | 'disconnect' | null;

const POLL_MS = 2500;
const CONNECT_CMD = 'aios model-router connect';
const DISCONNECT_CMD = 'aios model-router disconnect';
const CLIENT_IDS = ['claude', 'codex', 'pi'];

export function GatewayControl({ active }: { active: boolean }) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [connectFeedback, setConnectFeedback] = useState<Feedback | null>(null);
  const [copied, setCopied] = useState('');
  const inFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/model-routing/gateway');
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || '读取失败');
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
        const detail = body.result?.error || body.stderr || body.detail || body.error || '操作失败';
        setFeedback({ text: `${action === 'start' ? '启动' : '关闭'}失败：${detail}`, tone: 'error' });
      } else {
        const result = body.result ?? {};
        const text = action === 'start'
          ? (result.alreadyRunning ? `网关已在 ${result.url} 运行` : `网关已启动：${result.url}`)
          : (result.stopped ? '网关已关闭' : `网关未关闭：${result.reason || '未知'}`);
        setFeedback({ text, tone: result.stopped === false && action === 'stop' ? 'error' : 'ok' });
      }
    } catch (err) {
      setFeedback({ text: `${action === 'start' ? '启动' : '关闭'}失败：${err instanceof Error ? err.message : String(err)}`, tone: 'error' });
    } finally {
      setBusy(null);
      await loadStatus();
    }
  }

  async function runConnectAction(action: 'connect' | 'disconnect', client: string) {
    setConfirm(null);
    setBusy(action);
    setConnectFeedback(null);
    const name = clientLabel(client).name;
    try {
      const res = await fetch('/api/model-routing/gateway', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, confirm: true, client, ...(action === 'connect' ? { port: status?.port } : {}) }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        const detail = body.result?.error || body.stderr || body.detail || body.error || '操作失败';
        setConnectFeedback({ text: `${action === 'connect' ? '接入' : '还原'}失败：${detail}`, tone: 'error' });
      } else {
        const result = body.result ?? {};
        const text = action === 'connect'
          ? `${name} 已接入，普通命令即走网关`
          : (result.disconnected ? `${name} 已还原到接入前` : `${name} 未还原：${result.reason || '未知'}`);
        setConnectFeedback({ text, tone: result.disconnected === false && action === 'disconnect' ? 'error' : 'ok' });
      }
    } catch (err) {
      setConnectFeedback({ text: `${action === 'connect' ? '接入' : '还原'}失败：${err instanceof Error ? err.message : String(err)}`, tone: 'error' });
    } finally {
      setBusy(null);
      await loadStatus();
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1500);
    } catch {
      setConnectFeedback({ text: '复制失败：请手动选中命令复制', tone: 'error' });
    }
  }

  const pending = status === null;
  const running = status?.running ?? false;
  const managed = status?.managed ?? false;
  const canStop = running && managed;
  const ready = running && status?.ready === true;
  const readinessText = pending
    ? '尚未读取'
    : !running
    ? '网关未运行'
    : ready
      ? `可路由 ${status?.readyModels ?? status?.configuredModels ?? 0} 个模型`
      : status?.code === 'gateway-readiness-unavailable'
        ? '监听已启动，但无法确认已加载模型的就绪状态'
      : status?.code === 'PROVIDER_CREDENTIALS_MISSING'
        ? '监听已启动，但模型来源缺少有效凭据'
      : status?.code === 'PROVIDER_CONFIG_INVALID'
        ? '监听已启动，但加载的供应商配置无效'
      : status?.configuredModels === 0
        ? '监听已启动，但尚无模型访问配置'
      : status?.code === 'NO_ROUTE_CONFIGURED' && Number(status?.readyModels) > 1
        ? '监听已启动，多模型仍需显式默认或角色策略'
        : '监听已启动，但当前没有就绪模型';
  const restoreNotice = !running && status?.connected
    ? '有客户端仍指向网关。请启动网关或还原客户端，否则它们可能无法发送请求。'
    : '';
  const processNotice = pending
    ? '尚未读到进程和接入状态，当前无法确认网关是否运行。'
    : status?.stale
      ? `发现残留进程记录，但端口未响应，不能判定网关正在运行；重新启动时会检查进程状态。${restoreNotice}`
      : running && !managed
        ? '这个网关由外部前台进程启动，界面无法停机；请在启动它的终端按 Ctrl+C。aios model-router gateway-stop 仅对托管进程有效。'
        : running
          ? `界面托管进程 pid ${status?.pid}。停止网关不会自动还原客户端配置。`
          : restoreNotice || '网关尚未启动。启动监听不会自动接入客户端，也不会自动配置模型。';

  const confirmMeta = (() => {
    if (!confirm) return { title: '', description: '' };
    if (confirm.kind === 'start') return { title: '启动本地网关？', description: `将在本机 ${status?.url} 启动一个常驻网关进程，接入的客户端会开始把请求交给它路由。只绑 127.0.0.1，密钥仍只存环境变量。` };
    if (confirm.kind === 'stop') return { title: '关闭本地网关？', description: '将停止界面托管的网关进程，接入的客户端在网关重新启动前无法路由请求。' };
    if (confirm.kind === 'connect') {
      const name = clientLabel(confirm.client).name;
      return { title: `接入 ${name}？`, description: `将把 ${status?.url} 写进 ${name} 的真实配置（只改网关需要的 key，自动备份原值）。之后普通 ${name} 命令即走网关，用哪个模型由路由矩阵决定。可随时一键还原。` };
    }
    if (confirm.kind === 'disconnect') {
      const name = clientLabel(confirm.client).name;
      return { title: `还原 ${name}？`, description: `将把 ${name} 的配置还原到接入前的原值（移除我们写入的 key，恢复你原来的设置）。` };
    }
    return { title: '', description: '' };
  })();

  function onConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'connect' || confirm.kind === 'disconnect') void runConnectAction(confirm.kind, confirm.client);
    else void runAction(confirm.kind);
  }

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel className="min-w-0 p-6">
        <SmallTitle
          action={
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
              <Badge className="w-24 justify-center" tone={status?.stale ? 'warn' : running ? 'ok' : 'neutral'}>
                {pending ? '状态未知' : running ? '运行中' : status?.stale ? '进程记录已失效' : '未运行'}
              </Badge>
              <Button
                variant={running ? 'outline' : 'default'}
                size="sm"
                className="w-28 justify-start"
                disabled={pending || busy !== null || !!error || (running && !canStop)}
                onClick={() => setConfirm({ kind: running ? 'stop' : 'start' })}
              >
                <Power size={14} className="shrink-0" />
                <span className="flex-1 text-center">{pending ? '读取状态中' : busy ? '处理中…' : running ? '关闭网关' : '启动网关'}</span>
              </Button>
            </div>
          }
        >
          本地网关
        </SmallTitle>
        <p className="text-xs leading-6 text-rex-text-muted">
          网关跑在本机 <code className="inline-block w-52 max-w-full truncate rounded bg-rex-panel px-1 py-0.5 align-bottom font-rex-mono" title={status?.url}>{status?.url || '正在读取地址…'}</code>
          。
          启动后，已接入客户端的请求才会进入网关。停止网关不会自动还原客户端配置。
          网关在启动时加载配置；保存配置或刷新目录后，需要停止并重新启动才会生效。
        </p>
        <p className="mt-2 min-h-20 break-words text-[11px] leading-5 text-rex-text-muted sm:min-h-15">{processNotice}</p>
        <Panel className="mt-3 space-y-2 bg-rex-panel/40 p-3 text-xs leading-5">
          <Badge className="min-h-11 w-full whitespace-normal leading-5" tone={pending ? 'neutral' : ready ? 'ok' : 'warn'}>运行时就绪：{readinessText}</Badge>
          <p className="text-rex-text-muted">已保存配置：{status?.configuredModelCount === undefined ? '尚未读取' : `${status.configuredModelCount} 个显式绑定模型`}。运行中的网关仅使用启动时加载的快照，保存配置后需重启。</p>
          <p className="text-rex-text-muted">监听状态与模型访问能力分开统计。就绪检查不调用生成接口；模型目录发现也不代表生成已验证。</p>
        </Panel>
        <div className="mt-3 min-h-12 break-words text-[11px] leading-5">
          {error ? <>
            <span className="text-rex-danger">{pending ? '状态读取失败' : '刷新失败'}：{error}</span>
            <Button className="ml-2" size="sm" variant="ghost" onClick={() => void loadStatus()}>重试</Button>
          </> : <InlineFeedback feedback={feedback} idle="启停会在本机绑定/释放 127.0.0.1 端口，操作前需确认。" />}
        </div>
      </Panel>

      <Panel className="min-w-0 p-6">
        <SmallTitle action={<Badge className="w-28 justify-center" tone="neutral">{pending ? '读取接入状态…' : `${status?.clients.filter((item) => item.connected).length || 0} / ${status?.clients.length || 0} 已接入`}</Badge>}>
          接入客户端
        </SmallTitle>
        <p className="text-xs leading-6 text-rex-text-muted">
          目前支持下列客户端就地接入。确认后改写对应配置并备份原值；接入状态不代表已完成模型连接测试。
        </p>
        <div className="mt-3 space-y-2">
          {CLIENT_IDS.map((client) => {
            const item = status?.clients.find((entry) => entry.client === client);
            return (
              <div key={client} className="flex flex-wrap items-center gap-2 rounded-rex-md border border-rex-border bg-rex-panel/40 p-3">
                <Terminal size={14} className="text-rex-text-muted" />
                <span className="text-xs font-medium">{clientLabel(client).name}</span>
                <Badge className="w-14 justify-center" tone={item?.connected ? 'ok' : 'neutral'}>{!item ? '未知' : item.connected ? '已接入' : '未接入'}</Badge>
                <Button
                  className="ml-auto"
                  variant={item?.connected ? 'outline' : 'default'}
                  size="sm"
                  disabled={!item || busy !== null || !!error || (!running && !item.connected) || (!ready && !item.connected)}
                  onClick={() => setConfirm({ kind: item?.connected ? 'disconnect' : 'connect', client })}
                >
                  <Plug size={14} />
                  {busy ? '处理中…' : item?.connected ? '还原' : '接入'}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <InlineFeedback className="block min-h-10 break-words leading-5" feedback={error ? { text: `刷新失败：${error}`, tone: 'error' } : connectFeedback} idle={running && ready ? '接入/还原会改写真实配置，操作前需确认。' : '先让运行中的网关加载就绪的模型路由，再接入客户端。已接入的客户端仍可还原。'} />
        </div>
        <details className="group mt-4 text-[11px] leading-5 text-rex-text-muted">
          <summary className="cursor-pointer select-none">手动接入（隔离模式，不碰真实配置）</summary>
          <div className="hidden group-open:block">
            {status ? <p className="mt-2">
              不想改真实配置时，用 <code className="rounded bg-rex-panel px-1 py-0.5">{CONNECT_CMD} --isolated --port {status.port}</code> 生成隔离工件，再按下列命令启动客户端；还原用 <code className="rounded bg-rex-panel px-1 py-0.5">{DISCONNECT_CMD}</code>。codex/pi 隔离目录里暂时看不到你原有的 MCP/历史会话。
            </p> : <p className="mt-2">待读取网关端口后显示隔离接入命令。</p>}
            <div className="mt-2 space-y-2">
              {(status?.clients ?? []).map((item) => (
                <CommandRow key={item.client} text={item.launch} copied={copied === item.client} onCopy={() => copy(item.launch, item.client)} />
              ))}
            </div>
          </div>
        </details>
      </Panel>

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirmMeta.title}
        description={confirmMeta.description}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>取消</Button>
          <Button variant={confirm?.kind === 'stop' || confirm?.kind === 'disconnect' ? 'danger' : 'default'} onClick={onConfirm}>
            <Power size={14} />
            {confirm?.kind === 'start' ? '确认启动' : confirm?.kind === 'stop' ? '确认关闭' : confirm?.kind === 'connect' ? '确认接入' : '确认还原'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CommandRow({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-rex-bg px-2.5 py-1.5 text-[11px] leading-5 whitespace-nowrap text-rex-text-body ring-1 ring-rex-border">
        {text}
      </code>
      <Button variant="ghost" size="icon" aria-label={copied ? '已复制' : '复制命令'} onClick={onCopy}>
        {copied ? <Check size={15} className="text-rex-green" /> : <Copy size={15} />}
      </Button>
    </div>
  );
}
