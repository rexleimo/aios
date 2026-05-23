import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { getCommandSpawnSpec } from '../platform/process.mjs';
import { workspaceMemoryEventsPath } from '../memo/workspace-memory.mjs';
import { getClientCommandName, resolveClientFromRuntimeId } from '../clients/registry.mjs';
import { ROOT_DIR, runCommand } from './common.mjs';
import { buildCodexMcpDisableArgs } from './routes.mjs';
import { buildInteractiveRouteAutoPrompt } from './route-prompts.mjs';
import { buildOpenCodePrompt } from './opencode-context.mjs';
import { extractHandoffPrompt, getAutoPrompt } from './facade.mjs';

function commandForRuntime(agent) {
  const client = resolveClientFromRuntimeId(agent) || 'opencode';
  return getClientCommandName(client);
}

function usesWindowsShellFallback(command, env = process.env) {
  if (process.platform !== 'win32') return false;
  const spec = getCommandSpawnSpec(command, [], { env });
  return spec.shell === true;
}

function warnOpenCodeShellPromptSuppressed() {
  console.warn('[warn] Windows shell fallback detected for opencode; skipping automatic ContextDB prompt injection to avoid cmd.exe interpreting AIOS context lines as commands.');
  console.warn('[hint] Update/reinstall OpenCode so its launcher resolves to a direct executable entrypoint, then rerun the command.');
}

function routeAutoPrompt(opts) {
  return buildInteractiveRouteAutoPrompt(opts);
}

function buildClaudeInvocation({ contextText, extraArgs, injectContext, autoPrompt, explicitAutoPrompt }) {
  const args = injectContext ? ['--append-system-prompt', contextText, ...extraArgs] : [...extraArgs];
  if (autoPrompt) {
    const promptSource = explicitAutoPrompt ? 'env' : 'context handoff';
    console.log(`Auto prompt: enabled (${promptSource})`);
    args.push(autoPrompt);
  }
  return { cmd: commandForRuntime('claude-code'), args };
}

function buildGeminiInvocation({ contextText, extraArgs, injectContext, autoPrompt, explicitAutoPrompt, routeOptions }) {
  const effectiveAutoPrompt = autoPrompt || routeAutoPrompt(routeOptions);
  let combinedPrompt = injectContext ? contextText : '';
  if (effectiveAutoPrompt) {
    combinedPrompt = combinedPrompt ? `${combinedPrompt}\n\n## Auto Prompt\n${effectiveAutoPrompt}` : effectiveAutoPrompt;
    const promptSource = explicitAutoPrompt ? 'env' : 'context handoff';
    console.log(`Auto prompt: enabled (${promptSource})`);
  }
  return { cmd: commandForRuntime('gemini-cli'), args: combinedPrompt ? ['-i', combinedPrompt, ...extraArgs] : [...extraArgs] };
}

function buildCodexInvocation({ contextText, extraArgs, injectContext, autoPrompt, explicitAutoPrompt, routeOptions }) {
  const cmd = commandForRuntime('codex-cli');
  let shouldInject = injectContext;
  if (shouldInject && process.platform === 'win32' && getCommandSpawnSpec(cmd, [], { env: process.env }).shell === true) {
    shouldInject = false;
    console.warn('[warn] Windows shell wrapper detected for codex; skipping auto prompt injection. Paste the context packet as your first prompt.');
  }
  const effectiveAutoPrompt = explicitAutoPrompt ? explicitAutoPrompt : shouldInject ? '' : (autoPrompt || routeAutoPrompt(routeOptions));
  let combinedPrompt = shouldInject ? contextText : '';
  if (effectiveAutoPrompt) {
    combinedPrompt = combinedPrompt ? `${combinedPrompt}\n\n## Auto Prompt\n${effectiveAutoPrompt}` : effectiveAutoPrompt;
    const promptSource = explicitAutoPrompt ? 'env' : 'context handoff';
    console.log(`Auto prompt: enabled (${promptSource})`);
  }
  const codexConfigArgs = buildCodexMcpDisableArgs(process.env);
  return { cmd, args: combinedPrompt ? [...codexConfigArgs, ...extraArgs, combinedPrompt] : [...codexConfigArgs, ...extraArgs] };
}

function buildOpenCodeInvocation({ contextText, extraArgs, injectContext, autoPrompt, explicitAutoPrompt, contextPacketPath }) {
  const cmd = commandForRuntime('opencode-cli');
  const promptText = buildOpenCodePrompt({ contextPacketPath, contextText, prompt: autoPrompt, injectContext, promptKind: 'handoff' });
  const suppressPrompt = Boolean(promptText && usesWindowsShellFallback(cmd, process.env));
  if (suppressPrompt) {
    warnOpenCodeShellPromptSuppressed();
    return { cmd, args: [...extraArgs] };
  }
  if (promptText) {
    const promptSource = explicitAutoPrompt
      ? (contextPacketPath && injectContext ? 'env via file' : 'env')
      : (contextPacketPath && injectContext ? 'context handoff via file' : 'context handoff');
    console.log(`Auto prompt: enabled (${promptSource})`);
  }
  return { cmd, args: promptText ? ['--prompt', promptText, ...extraArgs] : [...extraArgs] };
}

const INTERACTIVE_BUILDERS = {
  'claude-code': buildClaudeInvocation,
  'gemini-cli': buildGeminiInvocation,
  'codex-cli': buildCodexInvocation,
  'opencode-cli': buildOpenCodeInvocation,
};

export function runInteractiveAgentWithSaveGuard(agent, contextText, extraArgs, opts) {
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
  };

  process.on('exit', saveGuard);
  runInteractiveAgent(agent, contextText, extraArgs, opts);
}

export function runInteractiveAgent(agent, contextText, extraArgs, opts = {}) {
  const explicitAutoPrompt = getAutoPrompt(process.env);
  const handoffPrompt = extractHandoffPrompt(contextText);
  const autoPrompt = explicitAutoPrompt || handoffPrompt;
  const builder = INTERACTIVE_BUILDERS[agent] || INTERACTIVE_BUILDERS['opencode-cli'];
  const routeOptions = { agent, ...opts };
  const { cmd, args } = builder({ contextText, extraArgs, autoPrompt, explicitAutoPrompt, routeOptions, ...opts });
  const result = runCommand(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
