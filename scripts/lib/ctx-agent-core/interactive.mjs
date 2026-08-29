/* 中文注释：交互启动只保留 CLI 透传与退出保存保护，不再注入 ContextDB/自动提示词。 */
import { spawnSync } from 'node:child_process';
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
  const strictAgentArgs = buildOpenCodeStrictAgentArgs(extraArgs);
  return { cmd, args: strictAgentArgs };
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

export function runInteractiveAgentWithSaveGuard(agent, extraArgs, opts) {
  const sessionId = opts.sessionId || '';
  const workspaceRoot = opts.workspaceRoot || '';
  let eventsMtimeMs = 0;
  if (sessionId && workspaceRoot) {
    try {
      eventsMtimeMs = statSync(workspaceMemoryEventsPath(workspaceRoot, sessionId)).mtimeMs;
    } catch {
      // 文件尚不存在时保持 0，退出钩子会写入保护 checkpoint。
    }
  }

  const saveGuard = () => {
    if (sessionId && workspaceRoot) {
      try {
        if (statSync(workspaceMemoryEventsPath(workspaceRoot, sessionId)).mtimeMs > eventsMtimeMs) return;
      } catch {
        // 读取失败时仍尝试写 checkpoint，避免丢失停机状态。
      }
    }
    try {
      spawnSync('node', [path.join(ROOT_DIR, 'scripts', 'ctx-agent.mjs'), '--agent', agent, '--workspace', workspaceRoot, '--project', opts.project || 'aios', '--save-guard', '--status', 'done'], { stdio: 'ignore', timeout: 10000 });
    } catch {
      // best-effort
    }

    // Generate session-close memory candidate (fire-and-forget, errors isolated)
    if (sessionId && workspaceRoot) {
      finalizeSession({
        rootDir: workspaceRoot,
        sessionId,
        reason: 'session-end',
        status: 'done',
      }).catch(() => {});
    }
  };

  process.on('exit', saveGuard);
  runInteractiveAgent(agent, extraArgs, opts);
}

export function runInteractiveAgent(agent, extraArgs, opts = {}) {
  const builder = INTERACTIVE_BUILDERS[agent];
  if (!builder) {
    console.error(`Unsupported interactive agent: ${agent}`);
    process.exit(1);
  }
  const { cmd, args } = builder({ extraArgs, ...opts });
  const result = runCommand(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
