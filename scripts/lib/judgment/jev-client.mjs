// scripts/lib/judgment/jev-client.mjs — 判定调用的【唯一出口】。
//
// 任何模块想发起一次 System One 判定，都必须经过这里。这样"默认关闭""预算"
// "形状校验""可审计的花费"才有单一的 owner，不会出现绕过开关的第二条调用路径。
//
// fail closed 的含义在这里是具体的：
//   - 未 enabled ⇒ 直接返回 judgment-disabled，不构造请求、不碰 socket；
//   - 凭据缺失 ⇒ credential-missing，同样不出去；
//   - 响应形状与发出的问题不匹配 ⇒ 报错，绝不把值强转成"看起来能用"的样子。
import { resolveVendorConfig, readJudgmentConfig, resolveJudgmentConfigPath } from './config.mjs';

export const JUDGMENT_VENDORS = Object.freeze({
  typesafe: Object.freeze({
    id: 'typesafe',
    displayName: 'TypeSafe System One (Jev)',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    modelsEndpoint: 'https://api.typesafe.ai/v1/models',
    credentialEnvVar: 'TYPESAFE_API_KEY',
    modelAlias: 'jev-latest',
  }),
});

export const QUESTION_TYPES = Object.freeze(['noul', 'choice', 'score']);
export const RETRYABLE_STATUSES = Object.freeze([429, 529]);
export const DEFAULT_MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 500;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUnitInterval(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isInstructions(value) {
  if (isNonEmptyString(value)) return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return false;
}

// 一次会话内的调用预算。CLI 是短进程，这里主要是给将来的 MCP 面复用。
export function createJudgmentSession() {
  return { calls: 0 };
}

export function resolveVendor(vendor = 'typesafe') {
  const entry = JUDGMENT_VENDORS[vendor];
  if (!entry) {
    const error = new Error(`unknown judgment vendor "${vendor}". Known: ${Object.keys(JUDGMENT_VENDORS).join(', ')}`);
    error.code = 'unknown-vendor';
    throw error;
  }
  return entry;
}

// 凭据只查存在性，值不进内存、不进日志、不进 ledger。
export function hasCredential(vendorEntry, env = process.env) {
  const raw = env[vendorEntry.credentialEnvVar];
  return isNonEmptyString(raw);
}

export function validateQuestions(questions) {
  const errors = [];
  if (!isPlainObject(questions)) return { ok: false, errors: ['questions must be an object'], value: null };
  const ids = Object.keys(questions);
  if (ids.length === 0) return { ok: false, errors: ['questions must contain at least one question'], value: null };

  const value = {};
  for (const id of ids) {
    const question = questions[id];
    if (!isPlainObject(question)) {
      errors.push(`question "${id}" must be an object`);
      continue;
    }
    const type = question.type;
    if (!QUESTION_TYPES.includes(type)) {
      errors.push(`question "${id}" has unsupported type "${type}" (expected one of ${QUESTION_TYPES.join(', ')})`);
      continue;
    }
    if (!isInstructions(question.instructions)) {
      errors.push(`question "${id}" requires non-empty instructions`);
      continue;
    }

    const criteria = question.criteria;
    if (type === 'noul') {
      // criteria 可选，且只允许 true/false 两个键。
      if (criteria !== undefined) {
        if (!isPlainObject(criteria)) {
          errors.push(`question "${id}" (noul) criteria must be an object with true/false descriptions`);
          continue;
        }
        const extra = Object.keys(criteria).filter((key) => key !== 'true' && key !== 'false');
        if (extra.length > 0) {
          errors.push(`question "${id}" (noul) criteria only accepts true/false (got ${extra.join(', ')})`);
          continue;
        }
        if (!Object.values(criteria).every((item) => isNonEmptyString(item))) {
          errors.push(`question "${id}" (noul) criteria values must be non-empty strings`);
          continue;
        }
      }
      value[id] = { type, instructions: question.instructions };
      if (criteria) value[id].criteria = { ...criteria };
      continue;
    }

    if (type === 'choice') {
      if (!isPlainObject(criteria) || Object.keys(criteria).length < 2) {
        errors.push(`question "${id}" (choice) requires a criteria map with at least two options`);
        continue;
      }
      const badValue = Object.entries(criteria)
        .find(([, description]) => description !== null && !isNonEmptyString(description));
      if (badValue) {
        errors.push(`question "${id}" (choice) criteria["${badValue[0]}"] must be a string or null`);
        continue;
      }
      value[id] = { type, instructions: question.instructions, criteria: { ...criteria } };
      continue;
    }

    // score：有序数组，至少两级。
    if (!Array.isArray(criteria) || criteria.length < 2 || !criteria.every((level) => isNonEmptyString(level))) {
      errors.push(`question "${id}" (score) requires an ordered criteria array with at least two level descriptions`);
      continue;
    }
    value[id] = { type, instructions: question.instructions, criteria: [...criteria] };
  }

  if (errors.length > 0) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value };
}

// 形状校验：先看 type 对不对，再看该 type 必须带的字段在不在、值域对不对。
// 任何不匹配都是错误，不做默认值填充、不做类型强转。
export function validateAnswer(questionId, question, answer) {
  const errors = [];
  if (!isPlainObject(answer)) return { ok: false, errors: [`answer "${questionId}" is not an object`], value: null };
  if (answer.type !== question.type) {
    return { ok: false, errors: [`answer "${questionId}" type mismatch: sent ${question.type}, got ${answer.type}`], value: null };
  }

  if (question.type === 'noul') {
    if (!isUnitInterval(answer.noul)) errors.push(`answer "${questionId}" (noul) requires noul in [0, 1]`);
    if (errors.length > 0) return { ok: false, errors, value: null };
    // Noul 按设计不携带 confidence，这里如实标注而不是编一个。
    return { ok: true, errors: [], value: { type: 'noul', noul: answer.noul, confidence: null } };
  }

  if (question.type === 'choice') {
    const options = Object.keys(question.criteria);
    if (!isNonEmptyString(answer.choice) || !options.includes(answer.choice)) {
      errors.push(`answer "${questionId}" (choice) returned "${answer.choice}" which is not one of the declared options`);
    }
    if (!isUnitInterval(answer.confidence)) errors.push(`answer "${questionId}" (choice) requires confidence in [0, 1]`);
    if (!isPlainObject(answer.probabilities)) {
      errors.push(`answer "${questionId}" (choice) requires a probabilities map`);
    } else if (Object.keys(answer.probabilities).some((key) => !options.includes(key) || !isFiniteNumber(answer.probabilities[key]))) {
      errors.push(`answer "${questionId}" (choice) probabilities must map declared options to finite numbers`);
    }
    if (errors.length > 0) return { ok: false, errors, value: null };
    return {
      ok: true,
      errors: [],
      value: {
        type: 'choice', choice: answer.choice, confidence: answer.confidence, probabilities: { ...answer.probabilities },
      },
    };
  }

  // score
  if (!isFiniteNumber(answer.score)) errors.push(`answer "${questionId}" (score) requires a finite score`);
  if (!isUnitInterval(answer.confidence)) errors.push(`answer "${questionId}" (score) requires confidence in [0, 1]`);
  if (!isPlainObject(answer.probabilities)) {
    errors.push(`answer "${questionId}" (score) requires a probabilities map`);
  } else if (Object.values(answer.probabilities).some((value) => !isFiniteNumber(value))) {
    errors.push(`answer "${questionId}" (score) probabilities must map level keys to finite numbers`);
  }
  if (errors.length > 0) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors: [],
    value: {
      type: 'score',
      score: answer.score,
      confidence: answer.confidence,
      probabilities: { ...answer.probabilities },
      legend: isPlainObject(answer.legend) ? { ...answer.legend } : null,
    },
  };
}

export function buildSystemOneRequest({ state, model, questions }) {
  return { state, model, questions };
}

function failure(reason, message, extra = {}) {
  return { ok: false, reason, message, ...extra };
}

async function defaultSleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function extractRequestId(response) {
  try {
    return response?.headers?.get?.('x-typesafe-request-id') || null;
  } catch {
    return null;
  }
}

/**
 * 发起一次判定。返回 {ok:true, ...} 或 {ok:false, reason, message}。
 * 注意：这是唯一允许对判定端点发起网络请求的函数。
 */
export async function askJudgment({
  vendor = 'typesafe',
  state,
  questions,
  session = createJudgmentSession(),
  config,
  configPath,
  env = process.env,
  homeDir,
  transport,
  sleep = defaultSleep,
  maxRetries = DEFAULT_MAX_RETRIES,
  forceDisabled,
} = {}) {
  const vendorEntry = resolveVendor(vendor);

  // 前置条件 2：显式开启。未开启不构造请求。
  const loaded = config ? { config, warnings: [], path: configPath || resolveJudgmentConfigPath({ env, homeDir }) } : readJudgmentConfig({ configPath, env, homeDir });
  const vendorConfig = resolveVendorConfig(loaded.config, vendor);
  if (forceDisabled === true || vendorConfig.enabled !== true) {
    return failure('judgment-disabled', `judgment is disabled for "${vendor}" (config: ${loaded.path})`);
  }

  // 前置条件 1：凭据存在性。
  if (!hasCredential(vendorEntry, env)) {
    return failure('credential-missing', `${vendorEntry.credentialEnvVar} is not set in this process`);
  }

  if (!isNonEmptyString(String(state ?? '')) && !isPlainObject(state) && !Array.isArray(state)) {
    return failure('invalid-state', 'state must be a non-empty string, object, or array');
  }

  const questionResult = validateQuestions(questions);
  if (!questionResult.ok) {
    return failure('invalid-questions', `invalid questions: ${questionResult.errors.join('; ')}`);
  }

  const body = buildSystemOneRequest({
    state,
    model: vendorConfig.model || vendorEntry.modelAlias,
    questions: questionResult.value,
  });
  const serialized = JSON.stringify(body);

  // 前置条件 3：预算。超预算同样不出去。
  if (session.calls >= vendorConfig.maxCallsPerSession) {
    return failure(
      'budget-calls-exceeded',
      `session call budget exhausted (${session.calls}/${vendorConfig.maxCallsPerSession})`,
    );
  }
  if (serialized.length > vendorConfig.maxInputChars) {
    return failure(
      'budget-input-exceeded',
      `request is ${serialized.length} chars, over the ${vendorConfig.maxInputChars} char limit`,
    );
  }

  const doFetch = transport || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return failure('transport-unavailable', 'no fetch implementation is available in this runtime');
  }

  session.calls += 1; // 计一次“逻辑调用”，重试不额外计费（429/529 通常未处理）。

  const headers = {
    Authorization: `Bearer ${env[vendorEntry.credentialEnvVar]}`,
    'Content-Type': 'application/json',
  };

  let lastReason = 'network-error';
  let lastMessage = 'request failed';
  let lastRequestId = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) await sleep(BACKOFF_BASE_MS * (2 ** (attempt - 1)));
    let response;
    try {
      response = await doFetch(vendorEntry.endpoint, {
        method: 'POST',
        headers,
        body: serialized,
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(vendorConfig.timeoutMs) : undefined,
      });
    } catch (error) {
      lastReason = 'network-error';
      lastMessage = error?.message || String(error);
      continue; // 网络故障可重试
    }

    const requestId = extractRequestId(response);
    if (requestId) lastRequestId = requestId;

    if (!response.ok) {
      lastReason = `http-${response.status}`;
      lastMessage = `judgment endpoint returned HTTP ${response.status}`;
      if (RETRYABLE_STATUSES.includes(response.status)) continue;
      return failure(lastReason, lastMessage, { status: response.status, requestId: lastRequestId });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      return failure('invalid-response', `response is not valid JSON (${error.message})`, { requestId: lastRequestId });
    }

    if (!isPlainObject(payload) || !isPlainObject(payload.answers)) {
      return failure('invalid-response', 'response is missing an answers map', { requestId: lastRequestId });
    }

    const answers = {};
    for (const [id, question] of Object.entries(questionResult.value)) {
      const answer = payload.answers[id];
      if (answer === undefined) {
        return failure('invalid-response', `response is missing an answer for "${id}"`, { requestId: lastRequestId });
      }
      const checked = validateAnswer(id, question, answer);
      if (!checked.ok) {
        return failure('invalid-response', checked.errors.join('; '), { requestId: lastRequestId });
      }
      answers[id] = checked.value;
    }

    const usage = isPlainObject(payload.usage)
      ? {
        inputTokens: isFiniteNumber(payload.usage.input_tokens) ? payload.usage.input_tokens : null,
        outputTokens: isFiniteNumber(payload.usage.output_tokens) ? payload.usage.output_tokens : null,
      }
      : { inputTokens: null, outputTokens: null };

    return {
      ok: true,
      vendor,
      model: isNonEmptyString(payload.model) ? payload.model : body.model,
      answers,
      usage,
      requestId: lastRequestId,
      attempts: attempt + 1,
    };
  }

  return failure(lastReason, lastMessage, { requestId: lastRequestId });
}
