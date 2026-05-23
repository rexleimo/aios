import { captureCommand, commandExists, runCommand } from '../../platform/process.mjs';

import { CRG_MCP_ALIAS } from './constants.mjs';

export function runCrgCommand(args, { cwd, dryRun = false, io = console } = {}) {
  if (!commandExists('uvx')) {
    throw new Error('Missing required command: uvx. Install uv first: https://docs.astral.sh/uv/getting-started/installation/');
  }
  io.log(`+ uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
  if (dryRun) {
    io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
    return null;
  }
  return runCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
}

export function captureCrgCommand(args, { cwd } = {}) {
  try {
    if (!commandExists('uvx')) return null;
    const result = captureCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
    if (result.status !== 0) return null;
    return result;
  } catch {
    return null;
  }
}
