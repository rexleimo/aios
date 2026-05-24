/* 中文注释：run 层只处理 CLI 输出格式，归档执行由 executeEntropyGc 完成。 */
import { executeEntropyGc } from './execute.mjs';
import { planEntropyGc } from './options.mjs';

export async function runEntropyGc(rawOptions = {}, { rootDir, io = console } = {}) {
  const { options } = planEntropyGc(rawOptions);
  const report = await executeEntropyGc(options, { rootDir, persistEvidence: true });

  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
    return { exitCode: 0, report };
  }

  io.log('ENTROPY GC');
  io.log('----------');
  io.log(`Session: ${report.sessionId || '(none)'}`);
  io.log(`Mode: ${report.mode}`);
  io.log(`Scanned: ${report.scannedCount}`);
  io.log(`Candidates: ${report.candidateCount}`);
  io.log(`Archived: ${report.archivedCount}`);
  if (report.manifestPath) {
    io.log(`Manifest: ${report.manifestPath}`);
  }
  if (report.evidence?.persisted === true) {
    io.log(`Checkpoint: ${report.evidence.checkpointId}`);
  } else if (report.evidence?.error) {
    io.log(`Evidence: failed - ${report.evidence.error}`);
  }

  return { exitCode: 0, report };
}
