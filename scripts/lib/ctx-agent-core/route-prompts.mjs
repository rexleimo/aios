import { parsePositiveInteger } from './common.mjs';
import {
  buildCtxAgentRoutePreview,
  buildHarnessRoutePreview,
  normalizeOrchestrateBlueprint,
  normalizeRouteMode,
  normalizeTeamRouteProvider,
  resolveHarnessRouteProviderForAgent,
  resolveRoutedSubagentClient,
} from './route-normalizers.mjs';

export function buildTaskRouterGuide({
  agent = '', workspaceRoot = '', project = '', teamProvider = 'auto', teamWorkers = 3,
  harnessProvider = 'auto', harnessMaxIterations = 8, blueprint = 'feature', routeMode = 'auto', sessionId = '',
} = {}) {
  const provider = teamProvider === 'auto' ? undefined : normalizeTeamRouteProvider(teamProvider);
  const effectiveProvider = provider || 'auto';
  const workers = parsePositiveInteger(teamWorkers, 3);
  const resolvedBlueprint = normalizeOrchestrateBlueprint(blueprint);
  const resolvedRouteMode = normalizeRouteMode(routeMode);
  const subagentClient = resolveRoutedSubagentClient({ agent, teamProvider: effectiveProvider, env: process.env });
  const teamCommand = buildCtxAgentRoutePreview({ agent, workspaceRoot, project, sessionId, routeMode: 'team', executionMode: 'live', teamProvider: effectiveProvider, teamWorkers: workers, taskPrompt: '<task>' });
  const subagentCommand = buildCtxAgentRoutePreview({ agent: subagentClient, workspaceRoot, project, sessionId, routeMode: 'subagent', executionMode: 'live', teamProvider: effectiveProvider, teamWorkers: workers, blueprint: resolvedBlueprint, taskPrompt: '<task>' });
  const harnessCommand = buildHarnessRoutePreview({ workspaceRoot, sessionId, provider: resolveHarnessRouteProviderForAgent({ agent, harnessProvider }), taskPrompt: '<task>', maxIterations: harnessMaxIterations });

  return [
    '## AIOS Task Router',
    `Default mode: ${resolvedRouteMode}`,
    'Choose execution route before planning:',
    '- single: one focused domain with low coupling; continue in the active client.',
    '- subagent: one primary domain but needs staged orchestration/verification gates.',
    '- team: 2+ independent domains, parallelizable work-items, or merge-gate heavy delivery.',
    '- harness: one long-running, overnight, resumable objective that needs an iteration journal and human handoff.',
    'Guardrails:',
    '- Prefer single by default; do not escalate to subagent/team/harness unless the trigger is explicit or clearly necessary.',
    '- Do not spawn built-in explorer/worker subagents only to "scan/explain a codebase".',
    '- If waiting for delegated workers, emit heartbeat every 30s; stop waiting after 120s and provide fallback next steps.',
    '- When dispatching subtasks to models, invoke the model-router skill to match task types to optimal models.',
    'Policy: when route=subagent/team/harness, execute the matching AIOS command directly (live) unless user explicitly requests preview/dry-run.',
    'User trigger shortcuts in one-shot prompt text:',
    '- /single <task>',
    '- /subagent <task>',
    '- /team <task>',
    '- /harness <task>',
    `Team trigger command: ${teamCommand}`,
    `Subagent trigger command: ${subagentCommand}`,
    `Harness trigger command: ${harnessCommand}`,
    '',
    '## Model Router',
    'When dispatching work to different models, use the model-router skill to match task types to the optimal model.',
    'Model dispatch commands:',
    '  node scripts/aios.mjs model-router route --task "<description>"          # Route task to best model',
    '  node scripts/aios.mjs model-router route --task "<desc>" --task-type <t> # Route with explicit type',
    '  node scripts/aios.mjs model-router stats                                 # View dispatch history',
    'Task types: code-review, security-review, architecture, implementation, browser-automation, research, planning, testing, docs, frontend, self-healing',
    'Override via env: AIOS_MODEL_PLANNER=claude-opus AIOS_MODEL_IMPLEMENTATION=deepseek-v4',
  ].join('\n');
}

export function buildInteractiveRouteAutoPrompt({
  agent = 'codex-cli', workspaceRoot = '', project = '', teamProvider = 'auto', teamWorkers = 3,
  harnessProvider = 'auto', harnessMaxIterations = 8, blueprint = 'feature', sessionId = '',
} = {}) {
  const provider = teamProvider === 'auto' ? 'auto' : normalizeTeamRouteProvider(teamProvider);
  const workers = parsePositiveInteger(teamWorkers, 3);
  const resolvedBlueprint = normalizeOrchestrateBlueprint(blueprint);
  const subagentClient = resolveRoutedSubagentClient({ agent, teamProvider: provider, env: process.env });
  const teamCommand = buildCtxAgentRoutePreview({ agent, workspaceRoot, project, sessionId, routeMode: 'team', executionMode: 'live', teamProvider: provider, teamWorkers: workers, taskPrompt: '<task>' });
  const subagentCommand = buildCtxAgentRoutePreview({ agent: subagentClient, workspaceRoot, project, sessionId, routeMode: 'subagent', executionMode: 'live', teamProvider: provider, teamWorkers: workers, blueprint: resolvedBlueprint, taskPrompt: '<task>' });
  const harnessCommand = buildHarnessRoutePreview({ workspaceRoot, sessionId, provider: resolveHarnessRouteProviderForAgent({ agent, harnessProvider }), taskPrompt: '<task>', maxIterations: harnessMaxIterations });
  return [
    'Continue from this state and execute the next best step.',
    'Routing policy: default to single-route execution.',
    'Only choose team/subagent when the user explicitly asks for delegation/parallel work, or when there are 2+ clearly independent domains.',
    'Only choose harness for explicit long-running, overnight, resumable, checkpoint-heavy objectives that need an iteration journal.',
    'Do NOT spawn built-in explorer/worker subagents just to scan a codebase; start single-agent first.',
    'If delegated workers are running, post a heartbeat every 30s and stop waiting after 120s with a fallback plan.',
    `If route=team, run: ${teamCommand}`,
    `If route=subagent, run: ${subagentCommand}`,
    `If route=harness, run: ${harnessCommand}`,
    'Do not ask the user to manually trigger these commands unless they requested dry-run/preview.',
  ].join('\n');
}
