import { readFile } from 'node:fs/promises';

import { validateStudentAction } from '../action-protocol.mjs';
import { checkForbiddenCommand, runCommand } from './command.mjs';
import { recordObservation } from './observations.mjs';
import { ensureBudgets, createDefaultExecutionPolicy } from './policy.mjs';
import { applyPatch } from './patch.mjs';
import { truncateText } from './text.mjs';
import { ensureWorkspaceReadable, resolveWorkspacePath } from './workspace.mjs';

async function executeReadAction({ workspace, action, policy }) {
  try {
    const targetPath = resolveWorkspacePath(workspace, action.path);
    const content = await readFile(targetPath, 'utf8');
    const truncated = truncateText(content, policy.max_output_bytes_per_stream);
    return await recordObservation({
      workspace,
      action,
      status: 'ok',
      payload: {
        path: action.path,
        content_excerpt: truncated.excerpt,
        content_truncated: truncated.truncated,
        bytes_read: Buffer.byteLength(content, 'utf8'),
      },
    });
  } catch (error) {
    if (/temp workspace root/i.test(error.message)) {
      throw error;
    }
    return await recordObservation({
      workspace,
      action,
      status: 'error',
      errorCode: 'read_failed',
      errorMessage: error.message,
      payload: {
        path: action.path,
        content_excerpt: '',
        content_truncated: false,
        bytes_read: 0,
      },
    });
  }
}

async function executeRunAction({ workspace, action, policy }) {
  const rejectionReason = checkForbiddenCommand(action.command, policy);
  if (rejectionReason) {
    return await recordObservation({
      workspace,
      action,
      status: 'rejected',
      errorCode: 'unsafe_command',
      errorMessage: rejectionReason,
      payload: {
        exit_code: 126,
        stdout_excerpt: '',
        stderr_excerpt: rejectionReason,
        stdout_truncated: false,
        stderr_truncated: false,
        files_touched: [],
      },
    });
  }

  const result = runCommand({ cwd: workspace.repoPath, command: action.command, policy });
  const stdout = truncateText(result.stdout, policy.max_output_bytes_per_stream);
  const stderr = truncateText(result.stderr, policy.max_output_bytes_per_stream);
  return await recordObservation({
    workspace,
    action,
    status: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'ok' : 'error',
    errorCode: result.timedOut ? 'command_timeout' : result.exitCode === 0 ? null : 'command_failed',
    errorMessage: result.timedOut ? 'Command exceeded max_command_seconds' : null,
    payload: {
      exit_code: result.exitCode,
      stdout_excerpt: stdout.excerpt,
      stderr_excerpt: stderr.excerpt,
      stdout_truncated: stdout.truncated,
      stderr_truncated: stderr.truncated,
      files_touched: [],
    },
  });
}

async function executePatchAction({ workspace, action, policy }) {
  try {
    const filesTouched = await applyPatch(workspace, action.diff);
    return await recordObservation({
      workspace,
      action,
      status: 'ok',
      payload: {
        applied: true,
        files_touched: filesTouched,
        reject_reason: null,
        diff_excerpt: truncateText(action.diff, policy.max_output_bytes_per_stream).excerpt,
      },
    });
  } catch (error) {
    return await recordObservation({
      workspace,
      action,
      status: 'error',
      errorCode: 'patch_failed',
      errorMessage: error.message,
      payload: {
        applied: false,
        files_touched: [],
        reject_reason: error.message,
        diff_excerpt: truncateText(action.diff, policy.max_output_bytes_per_stream).excerpt,
      },
    });
  }
}

export async function executeAction({ workspace, action, policy = createDefaultExecutionPolicy() }) {
  await ensureWorkspaceReadable(workspace);
  ensureBudgets(workspace, policy);
  const validatedAction = validateStudentAction(action);

  if (validatedAction.action === 'read') {
    return await executeReadAction({ workspace, action: validatedAction, policy });
  }
  if (validatedAction.action === 'run') {
    return await executeRunAction({ workspace, action: validatedAction, policy });
  }
  if (validatedAction.action === 'patch') {
    return await executePatchAction({ workspace, action: validatedAction, policy });
  }
  return await recordObservation({
    workspace,
    action: validatedAction,
    status: 'ok',
    payload: { message: validatedAction.message },
  });
}
