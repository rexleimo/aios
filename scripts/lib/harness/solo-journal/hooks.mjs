/* 中文注释：hook event 追加独立处理生命周期钩子证据，不修改 run summary。 */
import { appendFile, mkdir } from 'node:fs/promises';

import { normalizeText } from './normalizers.mjs';
import { getSoloHarnessPaths } from './paths.mjs';

export async function appendSoloHookEvent({ rootDir, sessionId, event = {} } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    throw new Error('solo hook event requires sessionId');
  }
  const payload = {
    ts: normalizeText(event.ts, new Date().toISOString()),
    kind: normalizeText(event.kind, 'hook'),
    hook: normalizeText(event.hook),
    phase: normalizeText(event.phase),
    iteration: Number.isFinite(event.iteration) ? Math.max(0, Math.floor(event.iteration)) : 0,
    status: normalizeText(event.status, 'ok'),
    detail: normalizeText(event.detail),
  };
  const paths = getSoloHarnessPaths({ rootDir, sessionId: normalizedSessionId });
  await mkdir(paths.dir, { recursive: true });
  await appendFile(paths.hookEventsPath, `${JSON.stringify(payload)}\n`, 'utf8');
  return {
    ...payload,
    hookEventsPath: paths.hookEventsPath,
  };
}
