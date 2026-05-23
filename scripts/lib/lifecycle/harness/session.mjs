import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { runContextDbCli } from '../../contextdb-cli.mjs';
import { resolveSoloHarnessProfile } from '../../harness/solo-profiles.mjs';
import { normalizeText } from './shared.mjs';

function createSessionId(provider = 'codex') {
  const profile = resolveSoloHarnessProfile({ provider });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${profile.clientId}-${stamp}-solo`;
}

function sessionMetaPath(rootDir, sessionId) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId, 'meta.json');
}

export function ensureSoloHarnessSession({ rootDir, sessionId = '', provider = 'codex', objective = '' } = {}) {
  const profile = resolveSoloHarnessProfile({ provider });
  const resolvedSessionId = normalizeText(sessionId, createSessionId(provider));
  if (existsSync(sessionMetaPath(rootDir, resolvedSessionId))) {
    return {
      sessionId: resolvedSessionId,
      profile,
    };
  }

  runContextDbCli(['init', '--workspace', rootDir]);
  runContextDbCli([
    'session:new',
    '--workspace',
    rootDir,
    '--agent',
    profile.clientId,
    '--project',
    path.basename(rootDir),
    '--goal',
    normalizeText(objective, `Solo harness: ${resolvedSessionId}`),
    '--session-id',
    resolvedSessionId,
    '--tags',
    `lane:solo-harness|provider:${profile.provider}`,
  ]);

  return {
    sessionId: resolvedSessionId,
    profile,
  };
}
