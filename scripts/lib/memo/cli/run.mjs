import path from 'node:path';

import { getMemoHelpText } from '../../cli/help.mjs';
import {
  DEFAULT_AIOS_ROOT_DIR,
  DEFAULT_WORKSPACE_MEMO_ENTRY_MAX_CHARS,
  DEFAULT_WORKSPACE_PINNED_MAX_CHARS,
} from './constants.mjs';
import { buildMemoGuiLaunchPlan, runMemoGuiServer } from './gui.mjs';
import { detectWorkspaceRoot, parseBoundedIntegerEnv, usageError } from './shared.mjs';
import {
  normalizeSpace,
  resolveActiveSpace,
  writeActiveSpaceToState,
} from './workspace-state.mjs';
import { handleMemoAddCommand, handleMemoListCommand, handleMemoRecallCommand, handleMemoSearchCommand } from './commands/events.mjs';
import { handleMemoPinCommand } from './commands/pin.mjs';
import { handleMemoSpaceCommand } from './commands/space.mjs';
import { handleMemoStorageCommand } from './commands/storage.mjs';
import { handleMemoSupersedeCommand } from './commands/supersede.mjs';
import { handleMemoCandidateCommand } from './commands/candidates.mjs';
import { handlePersonaCommand } from './commands/persona.mjs';

function resolveWorkspaceMemoLimits(env = process.env) {
  return {
    workspaceMemoEntryMaxChars: parseBoundedIntegerEnv(
      env.WORKSPACE_MEMORY_MEMO_ENTRY_MAX_CHARS,
      DEFAULT_WORKSPACE_MEMO_ENTRY_MAX_CHARS,
      { min: 256, max: 12000 },
    ),
    workspacePinnedMaxChars: parseBoundedIntegerEnv(
      env.WORKSPACE_MEMORY_PINNED_MAX_CHARS,
      DEFAULT_WORKSPACE_PINNED_MAX_CHARS,
      { min: 512, max: 20000 },
    ),
  };
}

export async function runMemo(rawOptions = {}, {
  io = console,
  rootDir = '',
  // Broker-reserved seam: explicit runtime identity is carried for audit/future authority, while CLI environment values are not authority.
  runtimeIdentity = null,
} = {}) {
  const argv = Array.isArray(rawOptions.argv) ? rawOptions.argv : [];
  const workspaceRoot = rootDir ? path.resolve(rootDir) : detectWorkspaceRoot(process.cwd());
  const activeSpace = resolveActiveSpace(workspaceRoot);
  const {
    workspaceMemoEntryMaxChars,
    workspacePinnedMaxChars,
  } = resolveWorkspaceMemoLimits(process.env);

  const [primary, secondary, ...rest] = argv;
  if (!primary || primary === '-h' || primary === '--help' || primary === 'help') {
    const showHelp = getMemoHelpText(argv.slice(1));
    io.log(showHelp);
    return;
  }

  if (primary === 'use') {
    const space = normalizeSpace([secondary, ...rest].join(' '));
    writeActiveSpaceToState(workspaceRoot, space);
    io.log(`Active space: ${space}`);
    io.log(`Workspace: ${workspaceRoot}`);
    return;
  }

  if (primary === 'gui') {
    const plan = buildMemoGuiLaunchPlan(argv, {
      workspaceRoot,
      aiosRootDir: process.env.AIOS_ROOT_DIR || DEFAULT_AIOS_ROOT_DIR,
    });
    await runMemoGuiServer(plan);
    return;
  }

  if (primary === 'storage') {
    await handleMemoStorageCommand({ secondary, rest, workspaceRoot, io });
    return;
  }

  if (primary === 'space') {
    handleMemoSpaceCommand({ secondary, workspaceRoot, activeSpace, io });
    return;
  }

  if (primary === 'persona' || primary === 'user') {
    handlePersonaCommand({ primary, secondary, rest, io, env: process.env });
    return;
  }

  if (primary === 'pin') {
    await handleMemoPinCommand({
      secondary,
      rest,
      workspaceRoot,
      activeSpace,
      workspacePinnedMaxChars,
      io,
    });
    return;
  }

  if (primary === 'add') {
    await handleMemoAddCommand({
      secondary,
      rest,
      workspaceRoot,
      activeSpace,
      workspaceMemoEntryMaxChars,
      io,
      runtimeIdentity,
    });
    return;
  }

  if (primary === 'recall') {
    await handleMemoRecallCommand({ argv, workspaceRoot, activeSpace, io });
    return;
  }

  if (primary === 'list') {
    await handleMemoListCommand({ argv, workspaceRoot, activeSpace, io });
    return;
  }

  if (primary === 'search') {
    await handleMemoSearchCommand({ argv, workspaceRoot, activeSpace, io });
    return;
  }

  if (primary === 'supersede') {
    await handleMemoSupersedeCommand({ argv, workspaceRoot, activeSpace, io });
    return;
  }

  if (primary === 'candidate') {
    await handleMemoCandidateCommand({
      secondary,
      rest,
      workspaceRoot,
      activeSpace,
      io,
      runtimeIdentity,
      env: process.env,
    });
    return;
  }

  throw usageError(`Unknown memo subcommand: ${primary}`);
}
