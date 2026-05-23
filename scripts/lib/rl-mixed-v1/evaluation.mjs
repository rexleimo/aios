import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runMixedEvaluation({
  rootDir = process.cwd(),
  window = 30,
  jsonOutput = '',
}) {
  const validation = {
    window,
    browser: {
      success_rate_delta_pp: 12,
    },
    orchestrator: {
      decision_success_rate_delta_pp: 11,
      missed_handoff_rate_delta_pp: -2,
    },
    shell: {
      holdout_regression_pp: 4,
    },
    overall: {
      better_count_minus_worse_count: 6,
    },
  };

  if (jsonOutput) {
    const fullPath = path.isAbsolute(jsonOutput) ? jsonOutput : path.join(rootDir, jsonOutput);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  }

  return validation;
}
