const GAIA_LEVELS = [1, 2, 3];
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

function normalizeNumeric(value) {
  const normalized = String(value).trim().replace(/[$%,]/gu, '');
  if (!NUMBER_PATTERN.test(normalized)) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeString(value) {
  return String(value).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function splitList(value) {
  const text = String(value).trim();
  if (!/[;,]/u.test(text)) return null;
  return text.split(/[;,]/u).map((item) => normalizeString(item));
}

function score(correct, total) {
  return {
    correct,
    total,
    accuracy: total === 0 ? null : correct / total,
  };
}

function assertAnswer(answer, label) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new Error(`${label} must be an answer object`);
  }
  if (typeof answer.taskId !== 'string' || answer.taskId.length === 0) {
    throw new Error(`${label}.taskId must be a non-empty string`);
  }
  if (!GAIA_LEVELS.includes(answer.level)) {
    throw new Error(`${label}.level must be one of 1, 2, or 3`);
  }
}

export function isGaiaAnswerCorrect(actual, expected) {
  const actualNumber = normalizeNumeric(actual);
  const expectedNumber = normalizeNumeric(expected);
  if (actualNumber !== null || expectedNumber !== null) {
    return actualNumber !== null && expectedNumber !== null && actualNumber === expectedNumber;
  }

  const actualList = splitList(actual);
  const expectedList = splitList(expected);
  if (actualList || expectedList) {
    return actualList !== null
      && expectedList !== null
      && actualList.length === expectedList.length
      && actualList.every((item, index) => item === expectedList[index]);
  }

  return normalizeString(actual) === normalizeString(expected);
}

export function summarizeGaiaScores(answers) {
  if (!Array.isArray(answers)) {
    throw new Error('GAIA answers must be an array');
  }

  const seenTaskIds = new Set();
  const totals = new Map(GAIA_LEVELS.map((level) => [level, { correct: 0, total: 0 }]));
  let overallCorrect = 0;

  answers.forEach((answer, index) => {
    const label = `GAIA answer ${index}`;
    assertAnswer(answer, label);
    if (seenTaskIds.has(answer.taskId)) {
      throw new Error(`duplicate taskId: ${answer.taskId}`);
    }
    seenTaskIds.add(answer.taskId);

    const correct = isGaiaAnswerCorrect(answer.actual, answer.expected);
    const level = totals.get(answer.level);
    level.total += 1;
    if (correct) {
      level.correct += 1;
      overallCorrect += 1;
    }
  });

  return {
    overall: score(overallCorrect, answers.length),
    byLevel: Object.fromEntries(
      GAIA_LEVELS.map((level) => {
        const levelScore = totals.get(level);
        return [level, score(levelScore.correct, levelScore.total)];
      }),
    ),
  };
}
