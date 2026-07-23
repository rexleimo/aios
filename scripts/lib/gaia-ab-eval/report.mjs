import { isGaiaAnswerCorrect, summarizeGaiaScores } from './scorer.mjs';

function assertRun(run, index) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    throw new Error(`GAIA A/B run ${index} must be an object`);
  }
  if (typeof run.client !== 'string' || run.client.length === 0) {
    throw new Error(`GAIA A/B run ${index}.client must be a non-empty string`);
  }
  if (typeof run.model !== 'string' || run.model.length === 0) {
    throw new Error(`GAIA A/B run ${index}.model must be a non-empty string`);
  }
  if (!run.arms || typeof run.arms !== 'object' || Array.isArray(run.arms)) {
    throw new Error(`GAIA A/B run ${index}.arms must be an object`);
  }
  if (!Array.isArray(run.arms.baseline) || !Array.isArray(run.arms.optimized)) {
    throw new Error(`GAIA A/B run ${index} must provide baseline and optimized answers`);
  }
}

function indexAnswers(answers) {
  return new Map(answers.map((answer) => [answer.taskId, answer]));
}

function assertMatchingTaskSets(baseline, optimized) {
  const baselineByTaskId = indexAnswers(baseline);
  const optimizedByTaskId = indexAnswers(optimized);
  if (baselineByTaskId.size !== optimizedByTaskId.size) {
    throw new Error('baseline and optimized task sets must match');
  }
  for (const taskId of baselineByTaskId.keys()) {
    if (!optimizedByTaskId.has(taskId)) {
      throw new Error('baseline and optimized task sets must match');
    }
  }
  return { baselineByTaskId, optimizedByTaskId };
}

function summarizePairs(baselineByTaskId, optimizedByTaskId) {
  const paired = {
    improved: 0,
    regressed: 0,
    bothCorrect: 0,
    bothIncorrect: 0,
  };

  for (const [taskId, baseline] of baselineByTaskId) {
    const optimized = optimizedByTaskId.get(taskId);
    const baselineCorrect = isGaiaAnswerCorrect(baseline.actual, baseline.expected);
    const optimizedCorrect = isGaiaAnswerCorrect(optimized.actual, optimized.expected);
    if (!baselineCorrect && optimizedCorrect) {
      paired.improved += 1;
    } else if (baselineCorrect && !optimizedCorrect) {
      paired.regressed += 1;
    } else if (baselineCorrect) {
      paired.bothCorrect += 1;
    } else {
      paired.bothIncorrect += 1;
    }
  }

  return paired;
}

export function buildGaiaAbReports(runs) {
  if (!Array.isArray(runs)) {
    throw new Error('GAIA A/B runs must be an array');
  }

  return runs.map((run, index) => {
    assertRun(run, index);
    const baseline = summarizeGaiaScores(run.arms.baseline);
    const optimized = summarizeGaiaScores(run.arms.optimized);
    const { baselineByTaskId, optimizedByTaskId } = assertMatchingTaskSets(
      run.arms.baseline,
      run.arms.optimized,
    );

    return {
      client: run.client,
      model: run.model,
      baseline,
      optimized,
      paired: summarizePairs(baselineByTaskId, optimizedByTaskId),
      conclusion: {
        status: 'inconclusive',
        reason: 'No statistical decision rule is configured for this offline report.',
      },
    };
  });
}
