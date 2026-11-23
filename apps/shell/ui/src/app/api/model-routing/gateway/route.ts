// 网关启停/接入与状态端点——界面「开关 + 一键接入」的后端。
// GET  /api/model-routing/gateway        → `aios model-router gateway-status --json`（运行中/托管/接入事实，只读）
// POST /api/model-routing/gateway        → { action: 'start' | 'stop' | 'connect' | 'disconnect', confirm: true, port?, client?, isolated? }
//
// 纪律照抄 /api/mcp：HTTP 请求体永远不进 shell。action 是闭合集合，端口/客户端经校验，
// 最后 spawn 的是字符串数组（execFile，无 shell、无插值）。启停本机服务、就地改写客户端真实配置都是有副作用的操作，
// 缺 confirm:true → 409（与 MCP 写入门同级）；状态只读不需要确认。
// 进程管理/就地接入的单一事实源在 scripts/lib/.../lifecycle/daemon.mjs 与 connect/inplace.mjs，本路由只经 CLI 调它。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { NextRequest } from 'next/server';
import { parseDocument, toModelCatalog } from '../../../../lib/config/model-routing.mjs';
import { readRegistrySnapshot } from '../../../../lib/config/model-registry-store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const ACTIONS = new Set(['start', 'stop', 'connect', 'disconnect']);
const CLIENTS = new Set(['claude', 'codex', 'pi', 'opencode', 'zcode', 'qoder', 'gemini', 'hermes', 'grok', 'workbuddy']);

// Keep syntax aligned with routing/targets.mjs without importing CLI code into Next.
function connectTarget(value: unknown): string | null {
  if (value === undefined || value === 'auto' || value === 'aios-auto') return 'auto';
  if (value === 'native') return value;
  if (typeof value !== 'string' || value.length > 2048) return null;
  const match = /^(model|group):(.+)$/u.exec(value);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2]);
    const encoded = encodeURIComponent(id);
    if (!id || id.length > 512 || /[\u0000-\u001f\u007f]/u.test(id) || match[2].replace(/%[0-9a-f]{2}/giu, (part) => part.toUpperCase()) !== encoded) return null;
    return `${match[1]}:${encoded}`;
  } catch { return null; }
}

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// 网关 CLI 带 --json 时恒输出单个 JSON 对象；解析失败就原样交回文本，不吞事实。
const parseCliJson = (stdout: string): unknown => {
  const text = String(stdout ?? '').trim();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 4000) };
  }
};

async function runGatewayCli(root: string, argv: string[]): Promise<unknown> {
  const script = path.join(root, 'scripts', 'aios.mjs');
  const { stdout } = await execFileAsync(process.execPath, [script, 'model-router', ...argv], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, AIOS_PROJECT_ROOT: root },
  });
  return parseCliJson(stdout);
}

async function configuredStatus(root: string) {
  try {
    const snapshot = await readRegistrySnapshot(path.join(root, 'memory', 'specs', 'model-registry.json'), path.join(root, 'scripts', 'lib', 'tooling', 'specs', 'registry', 'model-registry.json'));
    const models = toModelCatalog(parseDocument(snapshot.text));
    return { configuredReady: models.length > 0, configuredModelCount: models.length, configuredRevision: snapshot.hash };
  } catch {
    return { configuredReady: false, configuredModelCount: 0, configuredRevision: null, configError: 'config-unreadable' };
  }
}

// The listener owns its startup snapshot. Saved registry edits cannot establish live readiness.
async function listenerReadiness(status: { running?: boolean; port?: number }) {
  if (!status.running) return { ready: false, configuredModels: 0, readyModels: 0, code: 'gateway-not-running' };
  if (!Number.isInteger(status.port) || Number(status.port) < 1 || Number(status.port) > 65535) return { ready: false, code: 'gateway-readiness-unavailable' };
  try {
    const response = await fetch(`http://127.0.0.1:${status.port}/health`, { signal: AbortSignal.timeout(1500), cache: 'no-store', redirect: 'error' });
    const health = await response.json();
    if (!response.ok || health?.ok !== true) return { ready: false, code: 'gateway-readiness-unavailable' };
    return {
      ready: health.ready === true,
      configuredModels: Number.isInteger(health.configuredModels) && health.configuredModels >= 0 ? health.configuredModels : 0,
      readyModels: Number.isInteger(health.readyModels) && health.readyModels >= 0 ? health.readyModels : 0,
      ...(['NO_ROUTE_CONFIGURED', 'PROVIDER_CREDENTIALS_MISSING', 'PROTOCOL_TRANSLATION_UNAVAILABLE', 'PROVIDER_CONFIG_INVALID'].includes(health.code) ? { code: health.code } : {}),
    };
  } catch {
    return { ready: false, code: 'gateway-readiness-unavailable' };
  }
}

export async function GET(): Promise<Response> {
  try {
    const root = repoRoot();
    const result = await runGatewayCli(root, ['gateway-status', '--json']) as Record<string, unknown>;
    const [configured, health] = await Promise.all([configuredStatus(root), listenerReadiness(result)]);
    return json(200, { ok: true, ...result, ...configured, ...health, generationVerified: false });
  } catch (error) {
    return json(502, { error: 'gateway-status-failed', detail: error instanceof Error ? error.message : String(error) });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid-body', detail: 'expected a JSON object' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid-body', detail: 'expected a JSON object' });

  const action = typeof body.action === 'string' ? body.action : '';
  if (!ACTIONS.has(action)) return json(400, { error: 'invalid-action', detail: 'action must be start, stop, connect or disconnect' });
  if (body.confirm !== true) {
    return json(409, { error: 'confirmation-required', action, detail: 'this action changes local processes or client config; send {"confirm": true}' });
  }

  const argv = [action === 'start' ? 'gateway-start' : action === 'stop' ? 'gateway-stop' : action, '--json'];
  if (action === 'connect' && (body.port === undefined || body.port === null)) {
    return json(400, { error: 'invalid-port', detail: 'connect requires the port shown in gateway status' });
  }
  if ((action === 'start' || action === 'connect') && body.port !== undefined && body.port !== null) {
    const port = body.port;
    if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port >= 65_536) return json(400, { error: 'invalid-port', detail: 'port must be an integer in 1..65535' });
    argv.push('--port', String(port));
  }
  if ((action === 'connect' || action === 'disconnect') && body.client !== undefined && body.client !== null) {
    const client = typeof body.client === 'string' ? body.client : '';
    if (!CLIENTS.has(client)) return json(400, { error: 'invalid-client', detail: `client must be one of: ${[...CLIENTS].join(', ')}` });
    argv.push('--client', client);
  }
  if (action === 'connect') {
    const target = connectTarget(body.target);
    if (!target) return json(400, { error: 'invalid-target', detail: 'target must be auto, native, model:<encoded-id> or group:<encoded-id>' });
    argv.push('--target', target);
    const revision = body.expectedRevision;
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/u.test(revision)) return json(400, { error: 'invalid-revision', detail: 'connect requires the SHA-256 expectedRevision shown in gateway status' });
    argv.push('--expected-revision', revision);
  }
  if (action === 'connect' && body.isolated === true) argv.push('--isolated');

  try {
    const root = repoRoot();
    if (action === 'connect') {
      const current = await runGatewayCli(root, ['gateway-status', '--json']) as { running?: boolean; port?: number };
      if (!current?.running || current.port !== Number(body.port)) {
        return json(409, { error: 'gateway-changed', detail: 'gateway stopped or its port changed; refresh status before connecting' });
      }
      const health = await listenerReadiness(current);
      if (!health.ready) return json(409, { error: 'gateway-not-ready', detail: 'gateway is listening but has no ready model route; configure providers/models and restart before connecting' });
    }
    const result = await runGatewayCli(root, argv);
    return json(200, { ok: true, action, result });
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return json(200, {
      ok: false,
      action,
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      result: parseCliJson(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message ?? '').trim(),
    });
  }
}
