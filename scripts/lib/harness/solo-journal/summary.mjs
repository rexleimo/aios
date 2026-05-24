/* 中文注释：run-summary 读写只维护 solo harness 总状态，不处理 iteration/hook 文件。 */
import { normalizeRunSummary, normalizeText } from './normalizers.mjs';
import { getSoloHarnessPaths } from './paths.mjs';
import { safeReadJson } from './io.mjs';
import { writeFileAtomic } from '../../fs/atomic-write.mjs';

export async function writeSoloRunSummary(input = {}) {
  const summary = normalizeRunSummary(input);
  const paths = getSoloHarnessPaths(input);
  await writeFileAtomic(paths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return {
    ...summary,
    summaryPath: paths.summaryPath,
  };
}

export async function readSoloRunSummary({ rootDir, sessionId } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;
  const paths = getSoloHarnessPaths({ rootDir, sessionId: normalizedSessionId });
  const raw = await safeReadJson(paths.summaryPath);
  return raw ? normalizeRunSummary(raw) : null;
}
