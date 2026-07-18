/**
 * 用确定性规则验证 SkillOpt 工件，不能让模型相信自己的评分结论。
 *
 * 成功断言必须能在隔离 Target 的原始回答中找到连续原文；其余分数字段也
 * 只能由断言推导，避免 Scorer 把没有证据支持的结果提升为“通过”。
 */

function violation(code, message, details = {}) {
  return { code, message, ...details };
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sameNumber(actual, expected) {
  return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12;
}

function idsFrom(results) {
  return Array.isArray(results) ? results.map((result) => result?.id) : [];
}

function sameOrderedValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

/**
 * @param {{
 *   tasks: Array<{id: string, split: 'train'|'validation', assertions: string[]}>,
 *   raw: {runId?: string, results: Array<{id: string, targetResponse: string}>},
 *   scored: {runId?: string, results: Array, summary: {trainHard: number, validationHard: number, overallHard: number}},
 * }} artifacts - 一次隔离 Target 运行保存的三份工件。
 * @returns {{valid: boolean, violations: Array<{code: string, message: string}>, metrics: object}}
 */
export function validateTrainingEvidence({ tasks, raw, scored } = {}) {
  const violations = [];
  const definitions = Array.isArray(tasks) ? tasks : [];
  const rawResults = Array.isArray(raw?.results) ? raw.results : [];
  const scoredResults = Array.isArray(scored?.results) ? scored.results : [];
  const expectedIds = definitions.map((task) => task?.id);

  if (definitions.length === 0 || expectedIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    violations.push(violation('invalid_task_definitions', 'Tasks must contain non-empty string IDs.'));
  }
  if (new Set(expectedIds).size !== expectedIds.length) {
    violations.push(violation('duplicate_task_id', 'Task IDs must be unique.'));
  }
  if (!sameOrderedValues(idsFrom(rawResults), expectedIds)) {
    violations.push(violation('raw_task_ids_mismatch', 'Raw results must match task IDs in task-set order.'));
  }
  if (!sameOrderedValues(idsFrom(scoredResults), expectedIds)) {
    violations.push(violation('scored_task_ids_mismatch', 'Scored results must match task IDs in task-set order.'));
  }
  if (raw?.runId !== undefined && scored?.runId !== undefined && raw.runId !== scored.runId) {
    violations.push(violation('run_id_mismatch', 'Raw and scored artifacts must belong to the same run.'));
  }

  const rawById = new Map(rawResults.map((result) => [result?.id, result]));
  const metricsBySplit = { train: [], validation: [] };

  for (const definition of definitions) {
    const taskId = definition?.id;
    const rawResult = rawById.get(taskId);
    const scoredResult = scoredResults.find((result) => result?.id === taskId);
    const expectedAssertions = Array.isArray(definition?.assertions) ? definition.assertions : [];
    const prefix = { taskId };

    if (typeof rawResult?.targetResponse !== 'string' || rawResult.targetResponse.trim().length === 0) {
      violations.push(violation('missing_raw_response', 'Each raw result needs a non-empty target response.', prefix));
    }
    if (!scoredResult) continue;
    if (scoredResult.split !== definition.split) {
      violations.push(violation('split_mismatch', 'Scored split must equal the task definition split.', prefix));
    }
    const assertions = Array.isArray(scoredResult.assertions) ? scoredResult.assertions : [];
    if (!sameOrderedValues(assertions.map((entry) => entry?.name), expectedAssertions)) {
      violations.push(violation('assertion_names_mismatch', 'Scored assertions must match the task definition in order.', prefix));
    }

    let passedCount = 0;
    for (const assertion of assertions) {
      const assertionInfo = { ...prefix, assertion: assertion?.name };
      const validShape = assertion
        && typeof assertion.name === 'string'
        && typeof assertion.passed === 'boolean'
        && typeof assertion.evidenceQuote === 'string'
        && typeof assertion.rationale === 'string';
      if (!validShape) {
        violations.push(violation('invalid_assertion_shape', 'Each assertion needs name, passed, evidenceQuote, and rationale.', assertionInfo));
        continue;
      }
      if (assertion.rationale.trim().length === 0) {
        violations.push(violation('missing_assertion_rationale', 'Each assertion needs a non-empty rationale.', assertionInfo));
      }
      if (assertion.passed) {
        passedCount += 1;
        if (assertion.evidenceQuote.trim().length === 0) {
          violations.push(violation('passed_quote_missing', 'A passed assertion needs an evidence quote.', assertionInfo));
        } else if (!String(rawResult?.targetResponse ?? '').includes(assertion.evidenceQuote)) {
          violations.push(violation('passed_quote_not_in_raw_response', 'A passed quote must be a continuous substring of the raw target response.', assertionInfo));
        }
      } else if (assertion.evidenceQuote !== '') {
        violations.push(violation('failed_quote_must_be_empty', 'A failed assertion must not retain an evidence quote.', assertionInfo));
      }
    }

    if (expectedAssertions.length === 0) {
      violations.push(violation('task_without_assertions', 'Every task must define at least one assertion.', prefix));
      continue;
    }
    const expectedHard = passedCount === expectedAssertions.length ? 1 : 0;
    const expectedSoft = passedCount / expectedAssertions.length;
    if (scoredResult.hard !== expectedHard) {
      violations.push(violation('hard_not_derived_from_assertions', 'Hard score must equal 1 only when every assertion passes.', prefix));
    }
    if (!sameNumber(scoredResult.soft, expectedSoft)) {
      violations.push(violation('soft_not_derived_from_assertions', 'Soft score must equal passed assertions divided by total assertions.', prefix));
    }
    if (definition.split === 'train' || definition.split === 'validation') {
      metricsBySplit[definition.split].push(expectedHard);
    } else {
      violations.push(violation('invalid_task_split', 'Tasks must use train or validation splits.', prefix));
    }
  }

  const trainHard = metricsBySplit.train.length ? mean(metricsBySplit.train) : NaN;
  const validationHard = metricsBySplit.validation.length ? mean(metricsBySplit.validation) : NaN;
  const hardScores = [...metricsBySplit.train, ...metricsBySplit.validation];
  const overallHard = hardScores.length ? mean(hardScores) : NaN;
  const summary = scored?.summary;
  if (!summary || !sameNumber(summary.trainHard, trainHard) || !sameNumber(summary.validationHard, validationHard) || !sameNumber(summary.overallHard, overallHard)) {
    violations.push(violation('summary_metric_mismatch', 'Summary hard scores must be derived from validated task assertions.'));
  }

  return {
    valid: violations.length === 0,
    violations,
    metrics: {
      taskCount: definitions.length,
      trainTaskCount: metricsBySplit.train.length,
      validationTaskCount: metricsBySplit.validation.length,
      trainHard,
      validationHard,
      overallHard,
    },
  };
}
