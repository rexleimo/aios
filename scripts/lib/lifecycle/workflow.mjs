import { buildWorkflowDryRun, listWorkflowRecipes } from '../workflows/recipes.mjs';
import { prepareRexWorkflowSurface } from '../workflows/rex-workflow-surface-lifecycle.mjs';

function renderRecipeText(report) {
  const lines = [`AIOS workflow recipes (${report.policy})`];
  for (const recipe of report.recipes) {
    lines.push(`- ${recipe.workflowId}: ${recipe.liveReady ? 'ready' : 'blocked'}`);
    lines.push(`  stages: ${recipe.stages.map((stage) => `${stage.id}:${stage.agentId || stage.agentRole}`).join(' -> ')}`);
    if (recipe.blockers.length > 0) {
      lines.push(`  blockers: ${recipe.blockers.join('; ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runWorkflowCommand(
  options = {},
  {
    rootDir = process.cwd(),
    stdout = process.stdout,
    deps = {},
  } = {}
) {
  const subcommand = String(options.subcommand || 'list').trim().toLowerCase();
  const json = options.json || options.format === 'json';
  const dryRun = Boolean(options.dryRun || options.executionMode === 'dry-run');
  const workflowSurface = await (deps.prepareRexWorkflowSurface ?? prepareRexWorkflowSurface)({
    rootDir,
    fix: !dryRun,
    dryRun,
    io: deps.io ?? { log: () => {} },
  });
  if (workflowSurface.runtime && !workflowSurface.rex.ready) {
    throw new Error(`rex-harness is required for AIOS intelligent planning: ${workflowSurface.rex.fixHint}`);
  }

  if (subcommand === 'list') {
    const report = { ...await listWorkflowRecipes({ rootDir }), workflowSurface };
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderRecipeText(report));
    return { exitCode: report.recipes.some((recipe) => !recipe.liveReady) ? 1 : 0, report };
  }

  if (subcommand === 'run') {
    if (!options.dryRun && options.executionMode !== 'dry-run') {
      throw new Error('workflow run currently requires --dry-run until managed live execution evidence gates are implemented');
    }
    const report = {
      ...await buildWorkflowDryRun({
      rootDir,
      workflowId: options.workflowId,
      task: options.task,
      }),
      workflowSurface,
    };
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${report.workflowId}: ${report.status}\n`);
    return { exitCode: report.status === 'blocked' ? 1 : 0, report };
  }

  throw new Error('workflow requires subcommand: list or run');
}
