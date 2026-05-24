/* 中文注释：Shell 层在命令输出边界截获 stdout/stderr，保留 ref 后只返回可行动摘要。 */
import { spawn } from 'node:child_process';

import { createInterceptionEngine } from '../core/engine.mjs';
import { buildShellExecutionPlan } from './execution-plan.mjs';
import { planShellInterception } from './shell-planner.mjs';

/* 中文注释：Shell wrapper 是 L3 controlled runner；它先做安全/重写决策，再执行命令，最后把输出交给 engine。 */
export async function runShellEnvelope({ envelope, workspaceRoot, sessionId = 'default', host = 'aios-harness', thresholds, now, metrics }) {
  const command = String(envelope?.command || '').trim();
  if (!command) throw new TypeError('shell envelope command is required');

  const args = Array.isArray(envelope?.args) ? envelope.args.map(String) : [];
  const cwd = envelope?.cwd || workspaceRoot || process.cwd();
  const plannerInput = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  /* 中文注释：planner 在执行前拦截危险命令和大输出命令；这是 RTK/Caveman 类机制的前置门。 */
  const decision = planShellInterception({ command: plannerInput });
  if (decision.action === 'ask' || decision.action === 'deny') {
    /* 中文注释：被拦截的命令也返回 compact packet，让调用方拿到明确原因，而不是直接抛异常丢上下文。 */
    return {
      type: 'aios.compact_packet',
      version: 1,
      source: 'shell',
      host,
      sessionId,
      summary: decision.reason,
      key_lines: [],
      errors: [decision.reason],
      refs: [],
      metrics: { raw_bytes: 0, compact_bytes: Buffer.byteLength(decision.reason), saved_bytes: 0, saving_ratio: 0, strategy: decision.strategy },
      recall: [],
      safety: { redacted: false, requires_human: true },
    };
  }

  const executionPlan = buildShellExecutionPlan({ command, args, decision });
  /* 中文注释：只有通过 planner 的命令才执行；rewrite 决策必须执行重写后的安全命令。 */
  const executed = await spawnCaptured(executionPlan.command, executionPlan.args, {
    cwd,
    env: { ...process.env, ...(envelope?.env ?? {}) },
    shell: executionPlan.shell,
  });

  const engine = createInterceptionEngine({ workspaceRoot: workspaceRoot || cwd, thresholds, now, metrics });
  return engine.interceptToolResult({
    kind: 'shell',
    host,
    sessionId,
    cwd,
    payload: {
          command: executionPlan.commandText,
          exitCode: executed.exitCode,
          stdout: executed.stdout,
          stderr: executed.stderr,
        },
    metadata: { decision, executionPlan },
  });
}

/* 中文注释：这里不用 stdio inherit，是为了确保所有输出先进本地缓冲，再进入统一压缩和 metrics 链路。 */
function spawnCaptured(command, args, options) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', chunk => stdout.push(chunk));
    child.stderr?.on('data', chunk => stderr.push(chunk));
    child.on('error', error => resolve({ stdout: '', stderr: error.message, exitCode: 1 }));
    child.on('close', code => resolve({
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      exitCode: code ?? 0,
    }));
  });
}
