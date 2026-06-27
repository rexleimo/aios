// scripts/lib/cli/dispatch/helpers.mjs — 分发器辅助函数
// 从 dispatch.mjs 拆分出：printHelp、applyResultExitCode、runInteractiveTui

import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { getCommandHelpText, getInternalHelpText, getMemoHelpText, getRootHelpText } from '../help.mjs';

/** 帮助输出也走统一分发器，保证新增 interception 子命令后 CLI 和文档入口一致 */
function printHelp(parsed, { stdout = process.stdout } = {}) {
  if (!parsed || parsed.command === 'root') {
    stdout.write(getRootHelpText());
    return;
  }

  if (parsed.command === 'internal') {
    stdout.write(getInternalHelpText(parsed.options.target, parsed.options.action));
    return;
  }

  if (parsed.command === 'memo') {
    stdout.write(getMemoHelpText(parsed.options.argv));
    return;
  }

  stdout.write(getCommandHelpText(parsed.command));
}

/** 子命令返回 exitCode 时在这里统一映射到进程退出码，避免每个模块直接改 process */
export function applyResultExitCode(result) {
  if (typeof result?.exitCode === 'number') {
    process.exitCode = result.exitCode;
  }
}

/** TUI 是交互入口；非 TTY 下直接降级为 help，避免自动化环境挂起 */
function runInteractiveTui({ rootDir, projectRoot, stderr = process.stderr }) {
  const cliPath = path.join(rootDir, 'scripts/lib/tui-ink/cli.tsx');
  const tsxCliPath = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  if (!existsSync(tsxCliPath)) {
    stderr.write(`[err] missing TUI runtime dependency: ${tsxCliPath}\n`);
    stderr.write('[hint] Reinstall AIOS, or run from the install root: npm install --include=dev\n');
    process.exitCode = 1;
    return;
  }

  process.env.AIOS_ROOT_DIR = rootDir;
  process.env.AIOS_PROJECT_ROOT = projectRoot;

  const result = spawnSync(process.execPath, [tsxCliPath, cliPath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    stderr.write(`[err] failed to start AIOS TUI: ${result.error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const status = result.status ?? (result.signal ? 1 : 0);
  if (status !== 0) {
    process.exitCode = status;
  }
}

export { printHelp, runInteractiveTui };
