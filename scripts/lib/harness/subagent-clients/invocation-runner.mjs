import { spawnCommand } from '../../platform/process.mjs';
import { runCodexInvocation } from './codex-exec.mjs';
import { normalizeSpawnResult } from './spawn-result.mjs';

async function runSpawnInvocation(command, invocation, { env, timeoutMs, cwd }) {
  const result = await spawnCommand(command, invocation.args, { env, timeoutMs, cwd: cwd || undefined });
  return normalizeSpawnResult(result, timeoutMs);
}

const CLIENT_INVOCATION_RUNNERS = Object.freeze({
  spawn: runSpawnInvocation,
  'codex-exec': runCodexInvocation,
});

// 运行时边界：按 invocation.runner 选择执行器，避免 runOneShot 写客户端 if/else。
export async function runClientInvocation(command, invocation, options = {}) {
  const runner = CLIENT_INVOCATION_RUNNERS[invocation?.runner];
  if (!runner) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: `Unsupported subagent runner: ${String(invocation?.runner || '')}`,
    };
  }
  return runner(command, invocation, options);
}
