/* Interactive startup keeps the client prompt untouched while the bridge owns
 * durable session finalization after the client process exits. */
import { statSync } from 'node:fs';
import path from 'node:path';
import { workspaceMemoryEventsPath } from '../memo/workspace-memory.mjs';
import { getClientCommandName, resolveClientFromRuntimeId } from '../clients/registry.mjs';
import { ROOT_DIR, runCommand } from './common.mjs';
import { buildCodexMcpDisableArgs } from './routes.mjs';
import { buildOpenCodeStrictAgentArgs } from '../opencode/strict-primary-agent.mjs';
import { finalizeSession } from '../lifecycle/session-hooks/finalize.mjs';

function commandForRuntime(agent) {
  const client = resolveClientFromRuntimeId(agent);
  if (!client) throw new Error(`Unsupported interactive agent: ${agent}`);
  return getClientCommandName(client);
}

function buildClaudeInvocation({ extraArgs = [] }) {
  return { cmd: commandForRuntime('claude-code'), args: [...extraArgs] };
}

function buildGeminiInvocation({ extraArgs = [] }) {
  return { cmd: commandForRuntime('gemini-cli'), args: [...extraArgs] };
}

function buildCodexInvocation({ extraArgs = [] }) {
  const cmd = commandForRuntime('codex-cli');
  const codexConfigArgs = buildCodexMcpDisableArgs(process.env);
  return { cmd, args: [...codexConfigArgs, ...extraArgs] };
}

function buildOpenCodeInvocation({ extraArgs = [] }) {
  const cmd = commandForRuntime('opencode-cli');
  return { cmd, args: buildOpenCodeStrictAgentArgs(extraArgs) };
}

function buildHermesInvocation({ extraArgs = [] }) {
  return { cmd: commandForRuntime('hermes-agent'), args: [...extraArgs] };
}

function buildGrokInvocation({ extraArgs = [] }) {
  return { cmd: commandForRuntime('grok-build'), args: [...extraArgs] };
}

function buildWorkbuddyInvocation({ extraArgs = [] }) {
  return { cmd: commandForRuntime('workbuddy-agent'), args: [...extraArgs] };
}

const INTERACTIVE_BUILDERS = {
  'claude-code': buildClaudeInvocation,
  'gemini-cli': buildGeminiInvocation,
  'codex-cli': buildCodexInvocation,
  'opencode-cli': buildOpenCodeInvocation,
  'hermes-agent': buildHermesInvocation,
  'grok-build': buildGrokInvocation,
  'workbuddy-agent': buildWorkbuddyInvocation,
};

function captureWorkspaceMemoryMtime(sessionId, workspaceRoot) {
  if (!sessionId || !workspaceRoot) return 0;
  try {
    return statSync(workspaceMemoryEventsPath(workspaceRoot, sessionId)).mtimeMs;
  } catch {
    return 0;
  }
}

function workspaceMemoryChanged(sessionId, workspaceRoot, initialMtimeMs) {
  if (!sessionId || !workspaceRoot) return false;
  try {
    return statSync(workspaceMemoryEventsPath(workspaceRoot, sessionId)).mtimeMs > initialMtimeMs;
  } catch {
    return false;
  }
}

function writeSaveGuardCheckpoint(agent, opts) {
  if (!opts.workspaceRoot) return;
  const project = opts.project || 'aios';
  const result = runCommand(process.execPath, [
    path.join(ROOT_DIR, 'scripts', 'ctx-agent.mjs'),
    '--agent', agent,
    '--workspace', opts.workspaceRoot,
    '--project', project,
    '--save-guard',
    '--status', 'done',
  ], {
    cwd: opts.workspaceRoot,
    stdio: 'ignore',
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || `exit=${result.status ?? 1}`;
    console.warn(`[warn] interactive save guard skipped: ${detail}`);
  }
}

async function finalizeInteractiveSession(agent, opts, initialMtimeMs, exitCode) {
  const sessionId = opts.sessionId || '';
  const workspaceRoot = opts.workspaceRoot || '';
  if (!sessionId || !workspaceRoot) return { checkpoint: 'skipped', candidate: null };

  let checkpoint = 'existing';
  if (!workspaceMemoryChanged(sessionId, workspaceRoot, initialMtimeMs)) {
    writeSaveGuardCheckpoint(agent, opts);
    checkpoint = 'save-guard';
  }

  const status = exitCode === 0 ? 'done' : 'error';
  const reason = exitCode === 0 ? 'interactive-exit' : `interactive-exit-${exitCode}`;
  // Session-end memory is governed, not auto-written. finalizeSession records a
  // session-close *candidate* that requires human review/promotion before it
  // reaches shared recall. The program no longer silently persists an
  // agent-private session memo — persisting a session is the model/human's
  // judgment, expressed through the governed candidate path, not a side effect
  // of a clean client exit.
  const candidate = await finalizeSession({
    rootDir: workspaceRoot,
    sessionId,
    reason,
    status,
    logger: { log: (...args) => console.error(...args), error: (...args) => console.error(...args) },
  });
  console.error(`[aios] memory.session-finalize checkpoint=${checkpoint} candidate=${candidate?.candidateId || 'none'} status=${status}`);
  return { checkpoint, candidate, sessionMemo: { status: 'governed' } };
}

export async function runInteractiveAgentWithSaveGuard(agent, extraArgs, opts = {}) {
  const initialMtimeMs = captureWorkspaceMemoryMtime(opts.sessionId || '', opts.workspaceRoot || '');
  let result;
  try {
    result = runInteractiveAgent(agent, extraArgs, opts);
  } catch (error) {
    await finalizeInteractiveSession(agent, opts, initialMtimeMs, 1).catch((finalizeError) => {
      console.warn(`[warn] interactive session finalization failed: ${finalizeError.message || finalizeError}`);
    });
    throw error;
  }

  const exitCode = result?.status ?? (result?.error ? 1 : 0);
  await finalizeInteractiveSession(agent, opts, initialMtimeMs, exitCode).catch((error) => {
    console.warn(`[warn] interactive session finalization failed: ${error.message || error}`);
  });
  return result;
}

export function runInteractiveAgent(agent, extraArgs, opts = {}) {
  const builder = INTERACTIVE_BUILDERS[agent];
  if (!builder) throw new Error(`Unsupported interactive agent: ${agent}`);
  const { cmd, args } = builder({ extraArgs, ...opts });
  return runCommand(cmd, args, { cwd: opts.workspaceRoot, stdio: 'inherit' });
}
