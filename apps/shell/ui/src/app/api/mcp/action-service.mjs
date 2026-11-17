import path from 'node:path';
import { actionWrites, buildMcpArgv } from '../../../lib/data/mcp.mjs';
import { createPreviewStore, previewDigest } from './preview-store.mjs';

const SUCCESS = new Set(['installed', 'restored', 'uninstalled', 'adopted', 'unchanged', 'planned']);
const OWNERSHIP = new Set(['absent', 'owned', 'external', 'conflict', 'kept-differs']);
const ROLLBACK = new Set(['restored-from-backup', 'removed-created-file', 'no-rollback-available', 'rollback-incomplete']);
const RECOVERY_REASONS = new Set(['config-changed-after-commit', 'no-rollback-available', 'rollback-io-failed']);

function parse(stdout) {
  try { return JSON.parse(String(stdout)); } catch { return null; }
}

export function safeAddPreview(result) {
  return result?.schema === 'mcp.action.v1' && result.command === 'add' && result.dryRun === true
    && result.exitCode === 0 && ['planned', 'unchanged'].includes(result.status)
    && ['absent', 'owned'].includes(result.classification?.status)
    && /^[a-f0-9]{64}$/u.test(result.revision || '');
}

function safePath(value, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return undefined;
  return (allowEmpty && value === '') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) ? value : undefined;
}

function projectRecovery(result) {
  const recovery = result.recovery;
  if (result.rolledBack !== 'rollback-incomplete' || !recovery || typeof recovery !== 'object'
    || Array.isArray(recovery) || !RECOVERY_REASONS.has(recovery.reason)) return undefined;
  // Runtime recovery paths duplicate these CLI fields; do not open a new text channel.
  return {
    reason: recovery.reason,
    configPath: recovery.configPath === result.landing?.file ? safePath(recovery.configPath) : undefined,
    backupPath: recovery.backupPath === result.backupPath ? safePath(recovery.backupPath, true) : undefined,
  };
}

// Do not reflect raw argv, stderr, arbitrary CLI text or ownership records (entry values).
function projectResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    schema: result.schema, command: result.command, status: result.status,
    dryRun: result.dryRun === true, exitCode: result.exitCode,
    reason: /^[-a-z0-9:.]+$/u.test(result.reason || '') ? result.reason : undefined,
    classification: OWNERSHIP.has(result.classification?.status) ? { status: result.classification.status } : undefined,
    landing: result.landing && { file: safePath(result.landing.file), entryPath: result.landing.entryPath },
    planned: result.planned && { bytes: result.planned.bytes, entryPath: result.planned.entryPath },
    backupPath: safePath(result.backupPath, true),
    rolledBack: result.rolledBack && (ROLLBACK.has(result.rolledBack) ? result.rolledBack : 'rollback-failed'),
    recovery: projectRecovery(result),
  };
}

export function createMcpActionService({ list, run, context, previews = createPreviewStore() }) {
  const reply = (status, body) => ({ status, body });
  return {
    cancel(id) { previews.revoke(id); },
    async post(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { ok: false, error: 'invalid-body' });
      const action = typeof body.action === 'string' ? body.action : '';
      const writing = actionWrites(action) && body.dryRun !== true;
      // Consume before any await, even if validation, listing or execution subsequently fails.
      const approval = typeof body.previewId === 'string' ? previews.consume(body.previewId) : null;
      if (writing && body.confirm !== true) return reply(409, { ok: false, error: 'confirmation-required' });
      if (action === 'add' && writing && !approval) return reply(409, { ok: false, error: 'preview-required', detail: 'Run a fresh safe preview, then explicitly approve it.' });
      let listed;
      try { listed = await list(); } catch { return reply(502, { ok: false, error: 'mcp-list-failed' }); }
      if (!listed.ok) return reply(502, { ok: false, error: 'mcp-list-failed' });
      const landings = Array.isArray(listed.data?.landings) ? listed.data.landings : [];
      let built;
      try { built = buildMcpArgv(action, body, { landings }); } catch { return reply(400, { ok: false, error: 'invalid-action-arguments' }); }
      if (built.error) return reply(400, { ok: false, error: 'invalid-action-arguments' });
      const bypass = body.adopt === true || body.restore === true || body.force === true;
      if (action === 'add' && writing && bypass) return reply(409, { ok: false, error: 'unsafe-install-request' });
      if (action === 'add' && writing && approval.digest !== previewDigest(built.argv, context)) return reply(409, { ok: false, error: 'preview-required' });
      let execution;
      try { execution = await run(built.argv, approval?.revision || ''); } catch {
        execution = { exitCode: 1, stdout: '', uncertain: writing };
      }
      const result = parse(execution.stdout);
      const valid = execution.exitCode === 0 && result?.exitCode === 0 && result?.schema === 'mcp.action.v1'
        && result.command === action && (action === 'doctor' || SUCCESS.has(result.status));
      const ok = valid && (action !== 'add' || (body.dryRun === true
        ? !bypass && safeAddPreview(result) : ['installed', 'unchanged'].includes(result.status) && result.dryRun !== true));
      const preview = ok && action === 'add' && body.dryRun === true
        ? previews.issue(previewDigest(built.argv, context), result.revision) : undefined;
      return reply(200, {
        ok: Boolean(ok), action, exitCode: execution.exitCode,
        argv: built.argv.map((arg, index) => built.argv[index - 1] === '--entry' ? '<entry omitted>' : arg),
        result: projectResult(result), stderr: '', preview,
        // A failed child/transport may have written before losing its response. Always reconcile.
        refreshRequired: writing,
        error: ok ? undefined : !result ? 'mcp-execution-failed' : 'mcp-action-rejected',
      });
    },
  };
}
