/* 中文注释：interception 分发独立成命令处理器，避免顶层 dispatch 继续承载业务细节。 */
import { runInterceptionDoctor } from '../../interception/doctor.mjs';
import { runInterceptionProof } from '../../interception/proof.mjs';
import { runInterceptionTail } from '../../interception/tail.mjs';

/* 中文注释：proof 只验证链路；doctor/mcp-migrate 复用同一修复实现，防止修复逻辑分叉。 */
export async function runInterceptionCommand(parsed, { rootDir, workspaceRoot }) {
  if (parsed.options.subcommand === 'proof') {
    return runInterceptionProof(parsed.options, { rootDir: workspaceRoot });
  }
  if (parsed.options.subcommand === 'tail') {
    return runInterceptionTail(parsed.options, { rootDir: workspaceRoot });
  }

  if (parsed.options.subcommand === 'doctor' || parsed.options.subcommand === 'mcp-migrate') {
    return runInterceptionDoctor({
      ...parsed.options,
      fix: parsed.options.subcommand === 'mcp-migrate' ? true : parsed.options.fix,
    }, {
      rootDir,
      projectRoot: workspaceRoot,
    });
  }

  return { exitCode: 1 };
}
