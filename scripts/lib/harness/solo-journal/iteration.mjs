/* 中文注释：iteration 模块只负责单轮结果和日志追加，并同步摘要的 latest 字段。 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeFileAtomic } from '../../fs/atomic-write.mjs';
import { normalizeIterationOutcome } from './normalizers.mjs';
import { getSoloHarnessPaths, iterationFileName, iterationLogFileName } from './paths.mjs';
import { readSoloRunSummary, writeSoloRunSummary } from './summary.mjs';

export async function appendSoloIteration({ rootDir, sessionId, iteration, outcome, logEntries = [] } = {}) {
  const normalizedOutcome = normalizeIterationOutcome({ ...outcome, sessionId, iteration });
  const paths = getSoloHarnessPaths({ rootDir, sessionId });
  await mkdir(paths.iterationDir, { recursive: true });

  const iterationPath = path.join(paths.iterationDir, iterationFileName(normalizedOutcome.iteration));
  const logPath = path.join(paths.iterationDir, iterationLogFileName(normalizedOutcome.iteration));
  await writeFileAtomic(iterationPath, `${JSON.stringify(normalizedOutcome, null, 2)}\n`);

  if (Array.isArray(logEntries) && logEntries.length > 0) {
    await appendFile(
      logPath,
      `${logEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      'utf8'
    );
  } else {
    await writeFile(logPath, '', { encoding: 'utf8' });
  }

  const existingSummary = await readSoloRunSummary({ rootDir, sessionId });
  if (existingSummary) {
    await writeSoloRunSummary({
      rootDir,
      ...existingSummary,
      iterationCount: Math.max(existingSummary.iterationCount, normalizedOutcome.iteration),
      lastIteration: normalizedOutcome.iteration,
      lastOutcome: normalizedOutcome.outcome,
      lastFailureClass: normalizedOutcome.failureClass,
      lastStage: normalizedOutcome.stage,
      latestEvidence: normalizedOutcome.evidence,
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    outcome: normalizedOutcome,
    iterationPath,
    logPath,
  };
}
