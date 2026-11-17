import os from 'node:os';
import path from 'node:path';

import { loadRegistrySnapshot, saveRegistryDocument } from './registry.mjs';
import { GROUP_COMMAND_HANDLERS } from './group-commands.mjs';
import { runConnect, runConnectInplace, runDisconnect } from '../connect/command.mjs';
import { discoverAllModels, mergeDiscoveredModels } from '../routing/discovery.mjs';
import {
  buildModelStatsReport,
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  computeModelStats,
} from '../session/reporting.mjs';
import { loadModelDispatchHistory } from '../session/history.mjs';
import { resolveModelRoutingForTask } from '../routing/routing.mjs';
import {
  AVAILABILITY_DEFAULTS,
  effectiveAvailability,
  loadModelAvailability,
} from '../routing/availability.mjs';
import { getProviderForModel, listGatewayModels, loadProviders } from '../providers/registry.mjs';
import { importProvidersFromClients } from '../providers/import.mjs';
import { runTui } from '../tui.mjs';
import { getClientRoleMatrix, resolveModelForClientRole } from '../routing/client-role-matrix.mjs';
import { createGatewayServer } from '../gateway/serve.mjs';
import {
  GATEWAY_DEFAULT_PORT,
  defaultStateDir,
  gatewayStatus,
  resolveAiosScript,
  startGatewayDaemon,
  stopGatewayDaemon,
} from '../lifecycle/daemon.mjs';

function getSubcommand(rawOptions) {
  return String(rawOptions.subcommand || rawOptions._?.[0] || 'list').trim();
}

async function withRegistry(io, action, registryRoot) {
  try {
    return await action(await loadRegistrySnapshot({ rootDir: registryRoot }));
  } catch (error) {
    io.error(`Model registry command failed: ${error instanceof Error ? error.message : error}`);
    return { exitCode: 1 };
  }
}

const COMMAND_HANDLERS = Object.freeze({
  list({ registry, io }) {
    io.log('# Model Registry\n');
    io.log(buildModelSummaryTable(registry));
    io.log('\n## Routing Rules\n');
    io.log(buildRoutingTableMarkdown(registry));
    return { exitCode: 0 };
  },

  route({ rawOptions, registry, io }) {
    const task = String(rawOptions.task || rawOptions.prompt || '').trim();
    const taskType = String(rawOptions['task-type'] || rawOptions.taskType || '').trim();
    const profile = String(rawOptions.profile || '').trim();

    if (!task) {
      io.error('Missing --task or --prompt');
      return { exitCode: 1 };
    }

    const route = resolveModelRoutingForTask({
      taskType,
      taskDescription: task,
      registry,
      env: process.env,
      profile,
    });

    io.log(JSON.stringify({
      task,
      resolvedType: route.taskType,
      modelId: route.modelId,
      model: route.modelLabel,
      provider: route.provider,
      clientId: route.clientId,
      reason: route.reason,
      cliCommand: route.cliCommand,
      fallback: route.fallback,
      profile: route.profile,
      confidence: route.confidence,
      matchedSignals: route.matchedSignals,
      why: route.why,
      recommendedPhases: route.recommendedPhases,
      // 中文注释：契约层可复核字段——显式/自动、协议通道、原始诉求与被跳过的候选。
      explicit: route.explicit === true,
      contractMode: route.contractMode,
      modelProtocols: route.modelProtocols,
      requestedModelId: route.requestedModelId,
      executionClientId: route.executionClientId,
      ownDefaultModel: route.ownDefaultModel === true,
      channelDown: route.channelDown === true,
      degradedChannel: route.degradedChannel === true,
      skippedForCapability: (route.skipped || []).map((item) => ({
        modelId: item?.modelId || '',
        reason: item?.reason || '',
      })),
    }, null, 2));

    return { exitCode: 0 };
  },

  async 'tui'({ io }) {
    return runTui({ io });
  },

  ...GROUP_COMMAND_HANDLERS,

  async 'import-providers'({ rawOptions, registry, registrySnapshot, registryRoot, io }) {
    const home = String(rawOptions.home || process.env.HOME || '');
    const candidates = importProvidersFromClients({ home });
    if (!candidates.length) { io.log('No importable providers found in client configs.'); return { exitCode: 0 }; }
    const merged = { ...(registry.providers || {}) };
    for (const c of candidates) {
      if (!merged[c.id]) merged[c.id] = { baseUrl: c.baseUrl, apiKeyEnv: c.apiKeyEnv, endpointStyle: c.endpointStyle, protocols: c.protocols, models: [] };
    }
    const next = { ...registry, providers: merged };
    const backupDir = path.join(path.dirname(registrySnapshot.file), '..', '..', '.aios', 'config-backups');
    await saveRegistryDocument(next, { backupDir, rootDir: registryRoot, expectedHash: registrySnapshot.hash });
    io.log(`Imported ${candidates.length} provider(s):`);
    for (const c of candidates) io.log(`  ${c.id} -> ${c.baseUrl}`);
    return { exitCode: 0 };
  },

  // 只读本地通道证据，不联网；探测需显式走 probe 能力。
  availability({ workspaceRoot, io }) {
    const { filePath, cache } = loadModelAvailability({ cwd: workspaceRoot });
    const models = cache.models || {};
    const keys = Object.keys(models).sort();
    io.log('# Model Channel Availability\n');
    io.log(`Cache: ${filePath}`);
    io.log(`ttlMs=${cache.ttlMs || AVAILABILITY_DEFAULTS.ttlMs} cooldownMs=${AVAILABILITY_DEFAULTS.cooldownMs}\n`);
    if (!keys.length) {
      io.log('No channel evidence yet. Records come from real dispatch outcomes; set AIOS_MODEL_AVAILABILITY_FEEDBACK=0 to disable write-back.');
      return { exitCode: 0 };
    }
    const rows = [
      '| Channel (model@protocol) | State | Reason | Failures | Last latency | Updated |',
      '|---|---|---|---|---|---|',
    ];
    for (const key of keys) {
      const record = models[key] || {};
      const effective = effectiveAvailability(record);
      const latency = Number.isFinite(record.lastLatencyMs) ? `${record.lastLatencyMs}ms` : '—';
      const updated = record.updatedAt ? new Date(record.updatedAt).toISOString() : '—';
      rows.push(`| \`${key}\` | ${effective.state} | ${record.reason || '—'} | ${record.consecutiveFailures ?? 0} | ${latency} | ${updated} |`);
    }
    io.log(rows.join('\n'));
    io.log('\nStates decay on their own: `down` returns to `unknown` after the cooldown, `ok` after the TTL.');
    return { exitCode: 0 };
  },

  stats({ workspaceRoot, io }) {
    const history = loadModelDispatchHistory({ workspaceRoot, limit: 200 });
    const stats = computeModelStats(history);
    io.log(buildModelStatsReport(stats));
    return { exitCode: 0, stats };
  },

  // 中文注释：供应商注册表只读投影 + fail-closed 校验；密钥只展示 env 引用，绝不展示明文。
  providers({ registry, io }) {
    let providers;
    try {
      providers = loadProviders(registry);
    } catch (error) {
      io.error(error instanceof Error ? error.message : String(error));
      return { exitCode: 1 };
    }
    io.log('# Model Providers\n');
    const rows = [
      '| Provider | Base URL | Protocols | Models | Key ref |',
      '|---|---|---|---|---|',
    ];
    for (const provider of Object.values(providers)) {
      const inline = String(provider.apiKey || '').trim();
      const keyRef = inline ? `inline:${inline.length > 4 ? `••••${inline.slice(-4)}` : '••••'}` : (provider.apiKeyEnv || '—');
      rows.push(`| \`${provider.id}\` | ${provider.baseUrl} | ${provider.protocols.join(', ') || '—'} | ${provider.models.length || '(by protocol)'} | ${keyRef} |`);
    }
    io.log(rows.join('\n'));
    io.log('\nKeys may be inline (local config, shown masked here) or env:VAR references; plaintext secrets are never logged.');
    return { exitCode: 0 };
  },

  // 中文注释：客户端×角色矩阵。带 --client/--role 时解析单个配对，否则投影整张矩阵。
  matrix({ rawOptions, registry, io }) {
    const clientId = String(rawOptions.client || '').trim();
    const role = String(rawOptions.role || '').trim();
    if (clientId && role) {
      const decision = resolveModelForClientRole(clientId, role, registry, process.env);
      io.log(JSON.stringify({
        clientId,
        role,
        modelId: decision.modelId,
        reason: decision.reason,
        explicit: decision.explicit === true,
        ownDefaultModel: decision.ownDefaultModel === true,
      }, null, 2));
      return { exitCode: 0 };
    }
    const matrix = getClientRoleMatrix(registry);
    io.log('# Client × Role Matrix\n');
    io.log('## Global default\n');
    const defaultRoles = Object.keys(matrix.default);
    io.log(defaultRoles.length
      ? defaultRoles.map((roleName) => `- ${roleName} → \`${matrix.default[roleName]}\``).join('\n')
      : '(none — falls back to roleDefaults)');
    io.log('\n## Per-client overrides\n');
    const clientIds = Object.keys(matrix.clients);
    io.log(clientIds.length
      ? clientIds.map((id) => `- ${id}: ${Object.entries(matrix.clients[id]).map(([r, m]) => `${r}→\`${m}\``).join(', ')}`).join('\n')
      : '(none)');
    io.log('\nPrecedence: env AIOS_MODEL_<ROLE> > per-client > global default > roleDefaults.');
    return { exitCode: 0 };
  },

  // 中文注释：网关生产入口——起常驻 HTTP 服务（默认路由模式，--passthrough 纯透传）。只绑 127.0.0.1。
  async gateway({ rawOptions, registry, io }) {
    const port = Number(rawOptions.port) || GATEWAY_DEFAULT_PORT;
    const mode = rawOptions.passthrough ? 'passthrough' : 'routing';
    const stateDir = String(rawOptions.stateDir || process.env.AIOS_GATEWAY_STATE_DIR || path.join(os.homedir(), '.aios', 'gateway'));
    const server = createGatewayServer({ mode, port, registry, env: process.env, stateDir });
    let addr;
    try {
      addr = await server.listen();
    } catch (error) {
      io.error(`Gateway failed to start: ${error instanceof Error ? error.message : error}`);
      return { exitCode: 1 };
    }
    io.log(`AIOS gateway (${mode}) listening on http://127.0.0.1:${addr.port}`);
    if (server.decisionLog) io.log(`Routing decisions logged to ${server.decisionLog.filePath}`);
    io.log('Press Ctrl+C to stop.');
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
    await server.close();
    io.log('Gateway stopped.');
    return { exitCode: 0 };
  },

  // 中文注释：一键接入——默认「就地」(magpie 式)：外科改写客户端真实配置（备份原值，disconnect 还原），普通命令即走网关。
  // --isolated 退回旧隔离工件模式（不碰真实配置，需特殊启动命令）。--home 可注入供测试，默认真实 home。
  async connect({ rawOptions, registry, registrySnapshot, io }) {
    const gatewayUrl = String(rawOptions.gatewayUrl || `http://127.0.0.1:${Number(rawOptions.port) || GATEWAY_DEFAULT_PORT}`);
    const stateDir = String(rawOptions.stateDir || process.env.AIOS_GATEWAY_STATE_DIR || path.join(os.homedir(), '.aios', 'gateway'));
    const clients = rawOptions.client ? [String(rawOptions.client)] : ['claude', 'codex', 'pi'];
    const useJson = Boolean(rawOptions.json);
    const sink = useJson ? { log() {}, error() {} } : io;
    const common = {
      gatewayUrl,
      stateDir,
      registryFile: registrySnapshot.file,
      baseRegistry: registry,
      baseRegistryRevision: registrySnapshot.hash,
      ...(rawOptions.expectedRevision !== undefined ? { expectedRevision: rawOptions.expectedRevision } : {}),
      clients,
      codexModel: String(rawOptions.codexModel || ''),
      piModel: String(rawOptions.piModel || 'gateway-default'),
      ...(rawOptions.target !== undefined ? { target: rawOptions.target } : {}),
      dryRun: Boolean(rawOptions.dryRun || rawOptions['dry-run']),
      io: sink,
    };
    const result = rawOptions.isolated
      ? await runConnect(common)
      : await runConnectInplace({ ...common, home: String(rawOptions.home || os.homedir()) });
    if (useJson) io.log(JSON.stringify(result));
    return { exitCode: result.exitCode ?? 0 };
  },

  async disconnect({ rawOptions, registrySnapshot, io }) {
    const stateDir = String(rawOptions.stateDir || process.env.AIOS_GATEWAY_STATE_DIR || path.join(os.homedir(), '.aios', 'gateway'));
    const useJson = Boolean(rawOptions.json);
    const sink = useJson ? { log() {}, error() {} } : io;
    const clients = rawOptions.client ? [String(rawOptions.client)] : undefined;
    const result = await runDisconnect({ stateDir, registryFile: registrySnapshot.file, clients, io: sink });
    if (useJson) io.log(JSON.stringify(result));
    return { exitCode: result.exitCode ?? 0 };
  },

  // 中文注释：模型来源——magpie 式动态发现。--refresh 拉各 provider 模型列表并入注册表（curated 画像保留、新模型落最小条目）；
  // 默认/--json 列出可用模型目录（curated + discovered + custom）。发现是只读上游元数据调用，零生成扣费；密钥只进请求头。
  async models({ rawOptions, registry, registrySnapshot, registryRoot, io }) {
    const useJson = Boolean(rawOptions.json);
    if (rawOptions.refresh) {
      const { models: discovered, providers } = await discoverAllModels(registry, { env: process.env });
      const { registry: merged, added, enriched } = mergeDiscoveredModels(registry, discovered);
      const backupDir = path.join(path.dirname(registrySnapshot.file), '..', '..', '.aios', 'config-backups');
      await saveRegistryDocument(merged, { backupDir, rootDir: registryRoot, expectedHash: registrySnapshot.hash });
      const result = { ok: true, refreshed: true, discovered: discovered.length, added, enriched, total: Object.keys(merged.models || {}).length, providers: providers.map((p) => ({ provider: p.provider, models: p.models.length, errors: p.errors })) };
      if (useJson) io.log(JSON.stringify(result));
      else io.log(`Discovered ${discovered.length} models; added ${added}, enriched ${enriched}; registry now holds ${result.total} models.`);
      return { exitCode: 0 };
    }
    const catalog = listGatewayModels(registry, { env: process.env }).map((id) => {
      const m = registry.models[id];
      const { provider, upstreamModel } = getProviderForModel(id, registry);
      return { id, upstreamModel, label: m.label || id, protocols: m.protocols || [], provider: provider.id, source: m.source || 'registered', cost: m.cost || 'unknown' };
    });
    if (useJson) io.log(JSON.stringify({ models: catalog }));
    else if (!catalog.length) io.log('No gateway-ready models. Register a provider and model, then configure its credentials (or explicit authMode: none). Native CLI templates are not gateway connections.');
    else for (const m of catalog) io.log(`${m.id}\t${m.protocols.join('/')}\t${m.source}\t${m.cost}\tupstream=${m.upstreamModel}`);
    return { exitCode: 0 };
  },

  // 中文注释：后台托管启停——界面一键开关走这三个子命令。它们管理进程，不读注册表（配置坏了也要能停网关），
  // 故在分发处绕过 withRegistry。状态/停止永远 exitCode 0（「没在跑」是正常结论而非错误）；启动失败才非零。
  async 'gateway-start'({ rawOptions, io }) {
    const port = Number(rawOptions.port) || GATEWAY_DEFAULT_PORT;
    const stateDir = String(rawOptions.stateDir || defaultStateDir());
    const scriptPath = resolveAiosScript();
    const rootDir = path.resolve(scriptPath, '..', '..');
    const result = await startGatewayDaemon({ rootDir, port, stateDir, io });
    if (rawOptions.json) {
      io.log(JSON.stringify(result));
      return { exitCode: result.ok ? 0 : 1 };
    }
    if (result.ok) io.log(result.alreadyRunning ? `Gateway already running on ${result.url} (pid ${result.pid}).` : `Gateway started on ${result.url} (pid ${result.pid}).`);
    else io.error(`Gateway start failed: ${result.error}${result.detail ? ` (${result.detail})` : ''}`);
    return { exitCode: result.ok ? 0 : 1 };
  },

  async 'gateway-stop'({ rawOptions, io }) {
    const stateDir = String(rawOptions.stateDir || defaultStateDir());
    const result = await stopGatewayDaemon({ stateDir });
    if (rawOptions.json) {
      io.log(JSON.stringify(result));
      return { exitCode: 0 };
    }
    io.log(result.stopped ? `Gateway stopped (pid ${result.pid}).` : `Gateway not stopped: ${result.reason}.`);
    return { exitCode: 0 };
  },

  async 'gateway-tray'({ rawOptions, io }) {
    const port = Number(rawOptions.port) || GATEWAY_DEFAULT_PORT;
    const stateDir = String(rawOptions.stateDir || defaultStateDir());
    const scriptPath = resolveAiosScript();
    const rootDir = path.resolve(scriptPath, '..', '..');
    const result = await startGatewayDaemon({ rootDir, port, stateDir, io });
    if (result.ok) {
      io.log(`Tray/daemon running on ${result.url} (pid ${result.pid}).`);
      io.log('Open the URL in your browser for the control panel. (Native tray icon not bundled; use menubar app for that.)');
    } else io.error(`Tray start failed: ${result.error}`);
    return { exitCode: result.ok ? 0 : 1 };
  },

  async 'gateway-status'({ rawOptions, io }) {
    const stateDir = String(rawOptions.stateDir || defaultStateDir());
    const port = Number(rawOptions.port) || GATEWAY_DEFAULT_PORT;
    const result = await gatewayStatus({ stateDir, port });
    if (rawOptions.json) {
      io.log(JSON.stringify(result));
      return { exitCode: 0 };
    }
    io.log(`Gateway: ${result.running ? 'running' : 'stopped'}${result.managed ? ' (managed)' : ''} on ${result.url}`);
    io.log(`Connected: ${result.connected ? 'yes' : 'no'} · state dir ${result.stateDir}`);
    for (const client of result.clients) io.log(`  ${client.client}: ${client.connected ? 'connected' : 'not connected'} — ${client.launch}`);
    return { exitCode: 0 };
  },
});

export async function runModelRouterCommand(rawOptions = {}, { rootDir, registryRoot, io = console } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const subcommand = getSubcommand(rawOptions);
  const handler = COMMAND_HANDLERS[subcommand];

  if (!handler) {
    io.error(`Unknown subcommand: ${subcommand}. Use: ${Object.keys(COMMAND_HANDLERS).join(' | ')}`);
    return { exitCode: 1 };
  }

  if ((rawOptions.dryRun || rawOptions['dry-run']) && subcommand !== 'connect') {
    const result = { exitCode: 1, ok: false, dryRun: true, error: 'unsupported_dry_run', message: '--dry-run is supported only for connect; no action was taken.' };
    if (rawOptions.json) io.log(JSON.stringify(result));
    else io.error(result.message);
    return result;
  }

  // 生命周期子命令管理进程，不读注册表：配置损坏时也必须能查状态/停网关，故不被 withRegistry 拦下。
  if (subcommand === 'gateway-start' || subcommand === 'gateway-stop' || subcommand === 'gateway-status' || subcommand === 'gateway-tray') {
    return handler({ rawOptions, registry: null, workspaceRoot, io });
  }
  return withRegistry(io, (registrySnapshot) => handler({ rawOptions, registry: registrySnapshot.document, registrySnapshot, registryRoot, workspaceRoot, io }), registryRoot);
}
