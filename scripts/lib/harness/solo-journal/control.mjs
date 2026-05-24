/* 中文注释：control 文件只表达暂停/停止请求，不和运行摘要混写。 */
import { defaultControl, normalizeText } from './normalizers.mjs';
import { getSoloHarnessPaths } from './paths.mjs';
import { safeReadJson } from './io.mjs';
import { writeFileAtomic } from '../../fs/atomic-write.mjs';

export async function writeSoloControl(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('solo control requires sessionId');
  }
  const control = defaultControl(sessionId, input);
  const paths = getSoloHarnessPaths(input);
  await writeFileAtomic(paths.controlPath, `${JSON.stringify(control, null, 2)}\n`);
  return {
    ...control,
    controlPath: paths.controlPath,
  };
}

export async function readSoloControl({ rootDir, sessionId } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;
  const paths = getSoloHarnessPaths({ rootDir, sessionId: normalizedSessionId });
  const raw = await safeReadJson(paths.controlPath);
  return raw ? defaultControl(normalizedSessionId, raw) : defaultControl(normalizedSessionId);
}

export async function requestSoloHarnessStop({ rootDir, sessionId, reason = 'operator-request' } = {}) {
  return await writeSoloControl({
    rootDir,
    sessionId,
    stopRequested: true,
    reason,
    requestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearSoloHarnessStop({ rootDir, sessionId } = {}) {
  return await writeSoloControl({
    rootDir,
    sessionId,
    stopRequested: false,
    reason: '',
    requestedAt: null,
    updatedAt: new Date().toISOString(),
  });
}
