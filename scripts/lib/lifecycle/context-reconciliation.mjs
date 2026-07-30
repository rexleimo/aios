import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { resolveAiosStateRoot, resolveContextDbRoot } from '../aios/state-root.mjs';
import { isExecutionContextMutationDeclared } from '../contextdb/execution-context.mjs';
import { atomicWriteText, sha256Hex } from '../memo/storage/fs-io.mjs';
import { normalizeSessionId, readSessionChangedFiles } from '../session/changed-files.mjs';

function normalizePath(value) {
  return String(value || '').trim().replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/^\/+/u, '');
}

function comparisonPath(value) {
  const normalized = normalizePath(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function relativeDerivedPrefix(rootDir, absolutePath) {
  const relative = normalizePath(path.relative(path.resolve(rootDir), path.resolve(absolutePath)));
  return relative && relative !== '..' && !relative.startsWith('../') ? relative : '';
}

function outsideDerivedRoots(filePath, prefixes) {
  return !prefixes.some((prefix) => prefix && (filePath === prefix || filePath.startsWith(`${prefix}/`)));
}

function gitNameOnly(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    paths: String(result.stdout || '').split('\0').map(normalizePath).filter(Boolean),
    error: String(result.stderr || result.error?.message || '').trim(),
  };
}

export function collectGitChangedFiles(rootDir) {
  const observations = [
    gitNameOnly(rootDir, ['diff', '--name-only', '-z', '--']),
    gitNameOnly(rootDir, ['diff', '--cached', '--name-only', '-z', '--']),
    gitNameOnly(rootDir, ['ls-files', '--others', '--exclude-standard', '-z']),
  ];
  return {
    available: observations.every((item) => item.exitCode === 0),
    paths: uniqueSorted(observations.flatMap((item) => item.paths)),
    observations,
  };
}

export async function evaluateContextReconciliation({
  rootDir,
  sessionId = 'default',
  packet,
  env = process.env,
  persist = true,
  now = new Date(),
} = {}) {
  if (!rootDir) throw new Error('evaluateContextReconciliation requires rootDir');
  if (!packet || packet.kind !== 'contextdb.execution-context-packet') {
    throw new Error('evaluateContextReconciliation requires an ExecutionContextPacket');
  }
  const safeSessionId = normalizeSessionId(sessionId);
  const ledger = await readSessionChangedFiles({ rootDir, sessionId: safeSessionId, env });
  const ledgerPaths = uniqueSorted((ledger.files || []).map((file) => file.path));
  const git = collectGitChangedFiles(rootDir);
  const derivedPrefixes = uniqueSorted([
    relativeDerivedPrefix(rootDir, resolveAiosStateRoot(rootDir, { env })),
    relativeDerivedPrefix(rootDir, resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env })),
  ]);
  const gitPaths = git.paths.filter((filePath) => outsideDerivedRoots(filePath, derivedPrefixes));
  const actualPaths = uniqueSorted([...ledgerPaths, ...gitPaths]);
  const declaredPaths = uniqueSorted(packet.task?.targets || []);
  const undeclaredPaths = actualPaths.filter((filePath) => !isExecutionContextMutationDeclared(packet, filePath, { rootDir }));
  const actualPathKeys = new Set(actualPaths.map(comparisonPath));
  const missingDeclaredPaths = declaredPaths.filter((filePath) => !actualPathKeys.has(comparisonPath(filePath)));
  const wouldBlockReasons = [
    ...(undeclaredPaths.length > 0 ? ['undeclared_target'] : []),
    ...(!git.available ? ['reconciliation_git_unavailable'] : []),
  ];
  const generatedAt = new Date(now).toISOString();
  const decisionDigest = sha256Hex(JSON.stringify({
    contextRevision: packet.contextRevision,
    sessionId: safeSessionId,
    declaredPaths,
    derivedPrefixes,
    ledgerPaths,
    gitPaths,
    actualPaths,
    undeclaredPaths,
    missingDeclaredPaths,
    wouldBlockReasons,
  }));
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env });
  const receiptPath = path.join(
    contextDbRoot,
    'reconciliation',
    safeSessionId,
    `${decisionDigest.slice(0, 24)}.json`,
  );
  const result = {
    schemaVersion: 1,
    kind: 'contextdb.context-reconciliation-receipt',
    mode: 'shadow',
    generatedAt,
    decisionDigest,
    contextRevision: packet.contextRevision,
    sessionId: safeSessionId,
    declaredPaths,
    derivedPrefixes,
    ledgerPaths,
    gitPaths,
    actualPaths,
    undeclaredPaths,
    missingDeclaredPaths,
    gitAvailable: git.available,
    gitObservations: git.observations,
    wouldBlock: wouldBlockReasons.length > 0,
    wouldBlockReasons,
    admissionChanged: false,
    receiptPath,
  };
  if (persist) await atomicWriteText(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
