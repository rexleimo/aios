import { ctx, extractCreatedSessionId, extractLatestSessionId } from './contextdb-cli.mjs';

export async function handleWorkspaceCommand(command, workspaceRoot) {
  if (command === 'workspace-init') {
    const { initWorkspace } = await import('../contextdb/workspace.mjs');
    const { buildSkillIndex, writeSkillIndex } = await import('../contextdb/skill-index.mjs');
    const result = await initWorkspace(workspaceRoot);
    const index = await buildSkillIndex(workspaceRoot);
    await writeSkillIndex(workspaceRoot, index);
    console.log(JSON.stringify({ ...result, skillCount: index.skills.length }, null, 2));
    return;
  }
  if (command === 'workspace-sync') {
    const { buildSkillIndex, writeSkillIndex } = await import('../contextdb/skill-index.mjs');
    const index = await buildSkillIndex(workspaceRoot);
    await writeSkillIndex(workspaceRoot, index);
    console.log(JSON.stringify({ synced: index.skills.length }, null, 2));
    return;
  }
  if (command === 'workspace-doctor') {
    const { runDoctorChecks } = await import('../contextdb/doctor.mjs');
    const report = await runDoctorChecks(workspaceRoot);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'healthy') process.exitCode = 1;
  }
}

export function resolveSessionIdForSaveGuard(opts) {
  if (opts.sessionId) return opts.sessionId;
  const latestJson = ctx(opts.workspaceRoot, 'session:latest', ['--agent', opts.agent, '--project', opts.project]);
  const latestSessionId = extractLatestSessionId(latestJson);
  if (latestSessionId) return latestSessionId;
  const goal = opts.goal || `Shared context session for ${opts.agent} on ${opts.project}`;
  const createJson = ctx(opts.workspaceRoot, 'session:new', ['--agent', opts.agent, '--project', opts.project, '--goal', goal]);
  return extractCreatedSessionId(createJson);
}

export function runSaveGuardCheckpoint(opts) {
  ctx(opts.workspaceRoot, 'init', []);
  const sessionId = resolveSessionIdForSaveGuard(opts);
  if (!sessionId) throw new Error('Failed to resolve session id for save guard checkpoint');
  ctx(opts.workspaceRoot, 'checkpoint', [
    '--session', sessionId,
    '--summary', `Auto checkpoint: ${opts.agent} Stop hook completed`,
    '--status', opts.checkpointStatus,
    '--next', 'Continue next user request',
    '--verify-result', 'unknown',
    '--retry-count', '0',
  ]);
}

const WORKSPACE_VIEW_USAGE = 'Usage: workspace-view --session <id> [--task-type <type>] [--tier T0|T1|T2|T3] [--json]';

export function renderAgentView(view) {
  const lines = [];
  lines.push(`Agent view (session ${view.sessionId}, tier ${view.tier}, workspace v${view.workspaceVersion})`);
  lines.push(`Budget: ${Object.entries(view.budget.sections).map(([section, chars]) => `${section}=${chars}`).join(', ') || 'no sections'} (${Object.values(view.budget.sections).reduce((total, chars) => total + chars, 0)} chars total)`);
  lines.push(`Project context: ${view.projectContext ? `${view.projectContext.length} chars` : '(none)'}`);
  lines.push(`Relevant skills: ${view.relevantSkills.length}`);
  for (const entry of view.relevantSkills.slice(0, 5)) {
    const name = entry?.skill?.name || entry?.id || entry?.name || '(unnamed)';
    lines.push(`  - ${name}`);
  }
  if (view.activeSkill) lines.push(`Active skill: ${view.activeSkill.file} (${view.activeSkill.content.length} chars)`);
  lines.push(`Continuity: ${view.continuityPointer ? `${view.continuityPointer.sessionId}${view.continuity ? ' (full packet loaded)' : ' (pointer only)'}` : '(none)'}`);
  if (view.knowledge) lines.push(`Knowledge: loaded (${view.budget.sections.knowledge} chars)`);
  return lines.join('\n');
}

export async function handleWorkspaceViewCommand(args = [], workspaceRoot) {
  let sessionId = '';
  let taskType = '';
  let tier = 'T1';
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    const value = () => {
      const next = args[index + 1];
      if (next === undefined) throw new Error(`${arg} requires a value\n${WORKSPACE_VIEW_USAGE}`);
      index += 1;
      return next;
    };
    if (arg === '--session') sessionId = String(value());
    else if (arg === '--task-type') taskType = String(value());
    else if (arg === '--tier') tier = String(value()).toUpperCase();
    else if (arg === '--json') json = true;
    else throw new Error(`unknown option: ${arg}\n${WORKSPACE_VIEW_USAGE}`);
  }
  if (!sessionId) throw new Error(WORKSPACE_VIEW_USAGE);

  const { buildAgentView } = await import('../contextdb/workspace.mjs');
  const view = await buildAgentView(workspaceRoot, sessionId, taskType, { tier });
  process.stdout.write(`${json ? `${JSON.stringify(view, null, 2)}\n` : `${renderAgentView(view)}\n`}`);
  return view;
}
