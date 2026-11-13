import { loadRegistry } from './registry.mjs';
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
import { loadProviders } from '../routing/providers.mjs';
import { getClientRoleMatrix, resolveModelForClientRole } from '../routing/client-role-matrix.mjs';

function getSubcommand(rawOptions) {
  return String(rawOptions.subcommand || rawOptions._?.[0] || 'list').trim();
}

async function withRegistry(io, action) {
  try {
    return action(await loadRegistry());
  } catch (error) {
    io.error(`Failed to load model registry: ${error instanceof Error ? error.message : error}`);
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
      rows.push(`| \`${provider.id}\` | ${provider.baseUrl} | ${provider.protocols.join(', ') || '—'} | ${provider.models.length || '(by protocol)'} | ${provider.apiKeyEnv || '—'} |`);
    }
    io.log(rows.join('\n'));
    io.log('\nKeys are env references only (env:VAR); no plaintext secrets are stored or shown.');
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
});

export async function runModelRouterCommand(rawOptions = {}, { rootDir, io = console } = {}) {
  const workspaceRoot = rootDir || process.cwd();
  const subcommand = getSubcommand(rawOptions);
  const handler = COMMAND_HANDLERS[subcommand];

  if (!handler) {
    io.error(`Unknown subcommand: ${subcommand}. Use: ${Object.keys(COMMAND_HANDLERS).join(' | ')}`);
    return { exitCode: 1 };
  }

  return withRegistry(io, (registry) => handler({ rawOptions, registry, workspaceRoot, io }));
}
