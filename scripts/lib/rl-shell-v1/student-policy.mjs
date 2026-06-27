import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ACTION_VALUE_TOKENS = ['"read"', '"run"', '"patch"', '"stop"'];
const READ_PATH_TOKENS = ['"src/math.mjs"', '"src/normalize.mjs"', '"src/filter.mjs"'];
const RUN_COMMAND_TOKENS = ['"node --test"', '"cat src/math.mjs"', '"cat src/normalize.mjs"', '"cat src/filter.mjs"'];
const PATCH_DIFF_TOKENS = ['"*** Begin Patch\\n*** End Patch\\n"'];
const STOP_MESSAGE_TOKENS = ['"done"', '"unable_to_continue"'];

import { computeHash } from '../../../src/shared/normalize.mjs';

function nextRandom(policy) {
  let state = policy.rngState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  policy.rngState = state >>> 0;
  return (policy.rngState >>> 0) / 0x100000000;
}

function getWeight(weights, featureKey, tokenId) {
  const vector = weights[featureKey];
  if (!Array.isArray(vector)) {
    return 0;
  }
  return Number(vector[tokenId] || 0);
}

function inferTargetPath(featureKey) {
  const lower = String(featureKey || '').toLowerCase();
  if (lower.includes('normalize') || lower.includes('trim')) {
    return '"src/normalize.mjs"';
  }
  if (lower.includes('filter')) {
    return '"src/filter.mjs"';
  }
  return '"src/math.mjs"';
}

function inferRunCommand(featureKey) {
  const targetPath = inferTargetPath(featureKey);
  if (targetPath === '"src/normalize.mjs"') {
    return '"cat src/normalize.mjs"';
  }
  if (targetPath === '"src/filter.mjs"') {
    return '"cat src/filter.mjs"';
  }
  return '"cat src/math.mjs"';
}

function inferPreferredAction(featureKey) {
  const lower = String(featureKey || '').toLowerCase();
  if (lower.includes('obs=read') || lower.includes('content_excerpt')) {
    return '"run"';
  }
  if (lower.includes('tests_after=pass') || lower.includes('obs=run:ok')) {
    return '"stop"';
  }
  if (lower.includes('patch_failed')) {
    return '"stop"';
  }
  return '"read"';
}

function determineAllowedTokens(contextTokens, featureKey) {
  const actionToken = contextTokens[3];
  const keyToken = contextTokens[5];

  if (contextTokens.length === 0) return ['{'];
  if (contextTokens.length === 1) return ['"action"'];
  if (contextTokens.length === 2) return [':'];
  if (contextTokens.length === 3) return ACTION_VALUE_TOKENS;
  if (contextTokens.length === 4) return [','];

  if (contextTokens.length === 5) {
    if (actionToken === '"run"') return ['"command"'];
    if (actionToken === '"patch"') return ['"diff"'];
    if (actionToken === '"stop"') return ['"message"'];
    return ['"path"'];
  }

  if (contextTokens.length === 6) return [':'];

  if (contextTokens.length === 7) {
    if (keyToken === '"command"') return RUN_COMMAND_TOKENS;
    if (keyToken === '"diff"') return PATCH_DIFF_TOKENS;
    if (keyToken === '"message"') return STOP_MESSAGE_TOKENS;
    return READ_PATH_TOKENS;
  }

  if (contextTokens.length === 8) return ['}'];
  return [];
}

function heuristicBonus(token, contextTokens, featureKey) {
  if (contextTokens.length === 3 && token === inferPreferredAction(featureKey)) {
    return 2;
  }

  if (contextTokens.length === 7) {
    const keyToken = contextTokens[5];
    if (keyToken === '"path"' && token === inferTargetPath(featureKey)) {
      return 2;
    }
    if (keyToken === '"command"' && token === inferRunCommand(featureKey)) {
      return 2;
    }
    if (keyToken === '"message"' && token === '"done"') {
      return 1;
    }
  }

  return 0;
}

export function createDefaultVocabulary() {
  return [
    '{',
    '}',
    '"action"',
    ':',
    ',',
    '"read"',
    '"run"',
    '"patch"',
    '"stop"',
    '"path"',
    '"command"',
    '"diff"',
    '"message"',
    '"src/math.mjs"',
    '"src/normalize.mjs"',
    '"src/filter.mjs"',
    '"node --test"',
    '"cat src/math.mjs"',
    '"cat src/normalize.mjs"',
    '"cat src/filter.mjs"',
    '"*** Begin Patch\\n*** End Patch\\n"',
    '"done"',
    '"unable_to_continue"',
  ];
}

export function createStudentPolicy({ seed = 0, vocabulary = createDefaultVocabulary(), weights = {} }) {
  return {
    seed,
    vocabulary: [...vocabulary],
    vocabularyIndex: Object.fromEntries(vocabulary.map((token, index) => [token, index])),
    weights: JSON.parse(JSON.stringify(weights)),
    rngState: (seed >>> 0) || computeHash(`seed:${seed}`),
  };
}

export function scoreNextToken(policy, { contextTokens, featureKey = '' }) {
  const allowedTokens = determineAllowedTokens(contextTokens, featureKey);
  return allowedTokens
    .map((token) => {
      const tokenId = policy.vocabularyIndex[token];
      if (tokenId === undefined) {
        throw new Error(`Token not present in vocabulary: ${token}`);
      }
      const score = getWeight(policy.weights, featureKey, tokenId) + heuristicBonus(token, contextTokens, featureKey);
      return {
        token,
        tokenId,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || left.token.localeCompare(right.token));
}

export function sampleNextToken(policy, { contextTokens, featureKey = '', evaluationMode = false }) {
  const scored = scoreNextToken(policy, { contextTokens, featureKey });
  if (scored.length === 0) {
    return null;
  }

  if (evaluationMode || scored.length === 1) {
    return {
      ...scored[0],
      logprob: 0,
    };
  }

  const maxScore = Math.max(...scored.map((entry) => entry.score));
  const weights = scored.map((entry) => Math.exp(entry.score - maxScore));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const threshold = nextRandom(policy) * total;

  let cumulative = 0;
  for (let index = 0; index < scored.length; index += 1) {
    cumulative += weights[index];
    if (threshold <= cumulative || index === scored.length - 1) {
      return {
        ...scored[index],
        logprob: Math.log(weights[index] / total),
      };
    }
  }

  return {
    ...scored[0],
    logprob: Math.log(weights[0] / total),
  };
}

export async function savePolicyCheckpoint(filePath, policy) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = {
    seed: policy.seed,
    vocabulary: policy.vocabulary,
    weights: policy.weights,
    rngState: policy.rngState,
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function loadPolicyCheckpoint(filePath) {
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  const policy = createStudentPolicy({
    seed: raw.seed,
    vocabulary: raw.vocabulary,
    weights: raw.weights,
  });
  policy.rngState = raw.rngState >>> 0;
  return policy;
}
