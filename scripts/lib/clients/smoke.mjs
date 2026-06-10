import { spawnSync } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getClientHomes } from '../platform/paths.mjs';
import {
  getClientInstructionFileName,
  getClientProjectSkillRoot,
  resolveClientMcpTargetPaths,
} from './registry.mjs';

const SMOKE_TASK_PROMPT = 'reply with OK';
const SMOKE_TIMEOUT_MS = 20_000;

const SMOKE_CLIENTS = Object.freeze({
  crush: { command: 'crush', helpArgs: ['run', '--help'], taskArgs: ['run', SMOKE_TASK_PROMPT] },
});

export function buildSmokeInvocation(client) {
  const spec = SMOKE_CLIENTS[client];
  if (!spec) throw new Error(`unknown smoke client: ${client}`);
  return {
    command: spec.command,
    help: { args: [...spec.helpArgs] },
    task: { args: [...spec.taskArgs] },
  };
}

export function formatSmokeEvidence({ client, timestamp, helpExitCode, taskExitCode, taskOutput, resolvedPaths }) {
  return {
    client,
    timestamp,
    status: helpExitCode === 0 && taskExitCode === 0 ? 'pass' : 'fail',
    helpExitCode,
    taskExitCode,
    taskOutputSummary: String(taskOutput || '').slice(0, 500),
    resolvedPaths: resolvedPaths || {},
  };
}

function probePath(targetPath = '') {
  return {
    path: targetPath,
    exists: Boolean(targetPath) && existsSync(targetPath),
  };
}

function resolveClientPaths(client, { rootDir = process.cwd(), env = process.env } = {}) {
  const homeDir = typeof env.HOME === 'string' && path.isAbsolute(env.HOME) ? env.HOME : os.homedir();
  const clientHomes = getClientHomes(env, homeDir);
  const clientHome = clientHomes[client] || '';
  const projectSkillRoot = path.join(rootDir, getClientProjectSkillRoot(client));
  const instructionFile = path.join(rootDir, getClientInstructionFileName(client));
  const mcpTargets = resolveClientMcpTargetPaths(client, { projectRoot: rootDir, clientHome })
    .map((target) => ({ ...target, exists: existsSync(target.path) }));

  return {
    clientHome: probePath(clientHome),
    projectSkillRoot: probePath(projectSkillRoot),
    instructionFile: probePath(instructionFile),
    mcpTargets,
  };
}

export async function runClientSmoke(
  client,
  { rootDir = process.cwd(), env = process.env, spawnImpl = spawnSync, now = new Date() } = {}
) {
  const probes = buildSmokeInvocation(client);
  const spawnOptions = { encoding: 'utf8', env, timeout: SMOKE_TIMEOUT_MS };
  const help = spawnImpl(probes.command, probes.help.args, spawnOptions);
  const task = spawnImpl(probes.command, probes.task.args, spawnOptions);
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const evidence = formatSmokeEvidence({
    client,
    timestamp,
    helpExitCode: help.status ?? 127,
    taskExitCode: task.status ?? 127,
    taskOutput: `${task.stdout || ''}${task.stderr || ''}`,
    resolvedPaths: resolveClientPaths(client, { rootDir, env }),
  });
  const dir = path.join(rootDir, '.aios', 'clients', 'smoke');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${client}-${timestamp.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify(evidence, null, 2), 'utf8');
  return { evidence, evidencePath: file };
}

export function listSmokeClients() {
  return Object.keys(SMOKE_CLIENTS);
}
