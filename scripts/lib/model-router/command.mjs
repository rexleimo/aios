import { loadRegistry } from './registry.mjs';
import {
  buildModelStatsReport,
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  computeModelStats,
} from './reporting.mjs';
import { loadModelDispatchHistory } from './history.mjs';
import { resolveModelRoutingForTask } from './routing.mjs';

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
    }, null, 2));

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
