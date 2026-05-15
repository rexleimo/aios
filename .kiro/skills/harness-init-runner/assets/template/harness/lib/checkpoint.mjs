import path from 'node:path';

import { writeText } from './io.mjs';

export async function writeCheckpointArtifacts({
  runDir,
  providerId,
  taskText,
  exitCode,
  elapsedMs,
} = {}) {
  const checkpointJsonPath = path.join(runDir, 'checkpoint.json');
  const checkpointMdPath = path.join(runDir, 'checkpoint.md');
  const now = new Date().toISOString();

  const checkpoint = {
    schemaVersion: 1,
    ts: now,
    status: exitCode === 0 ? 'completed' : 'failed',
    provider: providerId,
    taskSummary: String(taskText || '').slice(0, 280),
    exitCode,
    elapsedMs,
    nextActions: [
      'Review stdout.txt and stderr.txt',
      'If needed, refine harness.config.json provider args',
      'Rerun with a narrower task or add a manual plan checkpoint',
    ],
    artifacts: [
      'prompt.md',
      'stdout.txt',
      'stderr.txt',
      'run.json',
    ],
  };

  await writeText(checkpointJsonPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await writeText(checkpointMdPath, [
    `# Checkpoint (${checkpoint.status})`,
    '',
    `- Time: ${checkpoint.ts}`,
    `- Provider: ${checkpoint.provider}`,
    `- Exit: ${checkpoint.exitCode}`,
    `- Elapsed: ${checkpoint.elapsedMs}ms`,
    '',
    '## Task',
    '',
    taskText,
    '',
    '## Next Actions',
    checkpoint.nextActions.map((item) => `- ${item}`).join('\n'),
    '',
    '## Artifacts',
    checkpoint.artifacts.map((item) => `- ${item}`).join('\n'),
    '',
  ].join('\n'));
}

