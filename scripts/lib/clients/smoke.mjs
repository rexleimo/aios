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

const SMOKE_CLIENTS = Object.freeze({});

const LIVE_TRIGGER_CLIENTS = Object.freeze({
  opencode: {
    command: 'opencode',
    args: ['run', 'AIOS_TRIGGER_PROBE: reply with AIOS_TRIGGER_OK if AGENTS.md, native skills, and the configured agent are loaded.'],
    successPattern: /AIOS_TRIGGER_OK/iu,
  },
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

export async function runClientTriggerLiveSmoke(
  client,
  { rootDir = process.cwd(), env = process.env, spawnImpl = spawnSync, now = new Date() } = {}
) {
  const spec = LIVE_TRIGGER_CLIENTS[client];
  if (!spec) throw new Error(`unknown live trigger smoke client: ${client}`);
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const result = spawnImpl(spec.command, spec.args, {
    cwd: rootDir,
    encoding: 'utf8',
    env,
    timeout: SMOKE_TIMEOUT_MS,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const triggerDetected = spec.successPattern.test(output);
  const evidence = {
    schemaVersion: 1,
    kind: 'client.trigger-live-smoke',
    client,
    timestamp,
    status: (result.status ?? 127) === 0 && triggerDetected ? 'pass' : 'fail',
    exitCode: result.status ?? 127,
    triggerDetected,
    taskOutputSummary: output.slice(0, 500),
    resolvedPaths: resolveClientPaths(client, { rootDir, env }),
  };
  const dir = path.join(rootDir, '.aios', 'clients', 'smoke');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${client}-trigger-live-${timestamp.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify(evidence, null, 2), 'utf8');
  return { evidence, evidencePath: file };
}

export function listSmokeClients() {
  return Object.keys(SMOKE_CLIENTS);
}
