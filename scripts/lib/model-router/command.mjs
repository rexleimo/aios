import { loadRegistry } from './registry.mjs';
import {
  buildModelStatsReport,
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  computeModelStats,
} from './reporting.mjs';
import { loadModelDispatchHistory } from './history.mjs';
import { resolveModelRoutingForTask } from './routing.mjs';
import {
  AVAILABILITY_DEFAULTS,
  effectiveAvailability,
  loadModelAvailability,
} from './availability.mjs';

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
