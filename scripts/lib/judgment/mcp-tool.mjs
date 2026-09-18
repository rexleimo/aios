// scripts/lib/judgment/mcp-tool.mjs — 判定闸门的 MCP 暴露层（t4）。
//
// 关键约定：**关闭时这个工具根本不在 tools/list 里**。
// 不是"注册了但调用时报拒绝"，而是工具表里没有它——让模型连"可以试一试"的念头都没有。
// 调用侧仍然会再查一次可用性（纵深防御），并且不可用时绝不触碰网络。
import { judgeVerdict, RISK_CLASSES } from './verdict.mjs';
import { resolveJudgmentAvailability, describeAvailability } from './availability.mjs';
import { askJudgment, createJudgmentSession, QUESTION_TYPES } from './jev-client.mjs';

export const JUDGMENT_TOOL_NAME = 'aios_judge';

export const JUDGMENT_TOOL_DEFINITION = Object.freeze({
  name: JUDGMENT_TOOL_NAME,
  description: [
    'Ask the opt-in System One (Jev) judgment gate a structured question and get back a typed verdict.',
    'This is a GATE, not a generator: it can only narrow an action (act / confirm / abort), never author content.',
    'Disabled by default. The tool only appears when the operator ran `aios judgment enable <vendor>` AND the',
    'vendor credential is present in the environment. When disabled, ask nothing here and fall back to your own',
    'declared judgment. Every answer is a proposal with a confidence and a vendor request id; never treat an',
    'answer as a verified fact about the repository.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        description: 'The situation to be judged. Include the concrete, checkable facts; this text is sent to the vendor.',
      },
      questions: {
        type: 'object',
        description: [
          'Map of question id -> question. Each question needs `instructions`, and `type` one of:',
          '`noul` (yes/no, returns a probability and no confidence),',
          '`score` (bounded integer scale, define the rubric in the instructions),',
          '`choice` (pick among `options`).',
          'For noul/choice add `criteria` with `true`/`false` descriptions so the boundary is explicit.',
        ].join(' '),
        additionalProperties: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...QUESTION_TYPES] },
            instructions: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            criteria: {
              type: 'object',
              properties: { true: { type: 'string' }, false: { type: 'string' } },
            },
          },
          required: ['instructions'],
        },
      },
      riskClass: {
        type: 'string',
        enum: [...RISK_CLASSES],
        description: 'How consequential the gated action is. Higher risk raises the act floor; it never lowers it. Default: guarded.',
      },
    },
    required: ['state', 'questions'],
  },
});

/**
 * 决定是否把判定工具放进工具表。baseTools 原样保留，本函数只做追加。
 */
export function withJudgmentTool(baseTools, options = {}) {
  const availability = resolveJudgmentAvailability(options);
  if (!availability.available) return baseTools;
  return [...baseTools, JUDGMENT_TOOL_DEFINITION];
}

/**
 * 工具调用处理。返回 MCP content 信封；不可用时 isError 且零网络调用。
 */
export async function handleJudgmentTool(params = {}, options = {}) {
  const {
    env = process.env,
    homeDir,
    config,
    configPath,
    transport,
    session = createJudgmentSession(),
    now = new Date(),
  } = options;

  const availability = resolveJudgmentAvailability({ env, homeDir, config, configPath });
  if (!availability.available) {
    // 纵深防御：即使调用方绕过 tools/list 直接 call，也不能出网。
    return judgmentError(
      `aios_judge is not available: ${describeAvailability(availability)}. `
      + 'The operator must run `aios judgment enable typesafe` and set the credential before this tool can be used.',
      { reason: availability.reason, configPath: availability.configPath },
    );
  }

  const riskClass = params.riskClass || params.risk_class || 'guarded';
  if (!RISK_CLASSES.includes(riskClass)) {
    return judgmentError(`unknown riskClass "${riskClass}" (expected one of ${RISK_CLASSES.join(', ')})`, {
      reason: 'invalid-risk-class',
    });
  }

  let result;
  try {
    result = await askJudgment({
      vendor: availability.vendor,
      state: params.state,
      questions: params.questions,
      config: config || undefined,
      configPath,
      env,
      homeDir,
      transport,
      session,
    });
  } catch (error) {
    return judgmentError(`aios_judge failed: ${error?.message || String(error)}`, { reason: 'judgment-error' });
  }

  if (!result.ok) {
    return judgmentError(`aios_judge was refused by the judgment client: ${result.message}`, {
      reason: result.reason,
      requestId: result.requestId || null,
    });
  }

  // 逐题把答案映射成 act/confirm/abort。任何一题算不出结论都不吞掉，直接报错。
  const verdicts = {};
  try {
    for (const [id, answer] of Object.entries(result.answers)) {
      verdicts[id] = judgeVerdict({
        answer,
        actFloor: availability.vendorConfig.actFloor,
        confirmFloor: availability.vendorConfig.confirmFloor,
        riskClass,
      });
    }
  } catch (error) {
    return judgmentError(`aios_judge could not map the answer to a verdict: ${error?.message || String(error)}`, {
      reason: 'invalid-answer',
      requestId: result.requestId || null,
    });
  }

  const payload = {
    schemaVersion: 1,
    kind: 'aios.judgment-result.v1',
    ok: true,
    vendor: result.vendor,
    model: result.model,
    requestId: result.requestId,
    usage: result.usage,
    attempts: result.attempts,
    riskClass,
    floors: pickFloors(verdicts),
    verdicts: Object.fromEntries(Object.entries(verdicts).map(([id, verdict]) => [id, shapeVerdict(verdict)])),
    judgedAt: now.toISOString(),
    // 判定是提案：明确告诉调用方这不是仓库事实。
    disposition: 'proposal-not-fact',
  };

  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function pickFloors(verdicts) {
  const first = Object.values(verdicts)[0];
  if (!first) return null;
  return { actFloor: first.effectiveActFloor, confirmFloor: first.effectiveConfirmFloor, lift: first.lift };
}

function shapeVerdict(verdict) {
  return {
    verdict: verdict.verdict,
    reason: verdict.reason,
    signal: verdict.signal,
    signalKind: verdict.signalKind,
    answer: verdict.answer,
  };
}

function judgmentError(message, extra = {}) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ schemaVersion: 1, kind: 'aios.judgment-result.v1', ok: false, message, ...extra }, null, 2) }],
  };
}
