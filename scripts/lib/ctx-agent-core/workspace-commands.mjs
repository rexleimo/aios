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
