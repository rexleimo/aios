// scripts/lib/judgment/stage-gate.mjs — rex 阶段推进前的判定闸门（t5）。
//
// 这是 **host 侧策略**：rex 子模块只负责"问"，推进与否由 host 决定。rex 本身不知道
// 存在这个闸门，所以关掉它以后 rex 的行为与引入之前逐字节相同。
//
// 闸门只能收窄：唯一的两种结局是 advance 与 hold。它永远无法把一个本来会被拒绝的
// 推进变成放行——放行需要 verifiable evidence，而那由确定性 precheck 与阈值共同判定。
import { readJudgmentConfig } from './config.mjs';
import { resolveJudgmentAvailability, describeAvailability } from './availability.mjs';
import { askJudgment, createJudgmentSession } from './jev-client.mjs';
import { judgeVerdict } from './verdict.mjs';

export const STAGE_GATE_QUESTION_ID = 'verifiable_evidence';

export const STAGE_GATE_CRITERIA = Object.freeze({
  true: 'The evidence contains concrete, independently checkable references (artifact paths, commands with their output, diffs, or logs) that demonstrate the claimed work.',
  false: 'The evidence is absent, only restates intent or a plan, contradicts itself, or cannot be checked by a reviewer without trusting the author.',
});

export function buildStageGateQuestions() {
  return {
    [STAGE_GATE_QUESTION_ID]: {
      type: 'noul',
      instructions: [
        'Decide whether the evidence below demonstrates verifiable completion of the work claimed for this stage.',
        'Judge only what the evidence shows; do not assume unstated work happened.',
        'Answer false when the references would not let a reviewer reproduce or read the result.',
      ],
      criteria: { ...STAGE_GATE_CRITERIA },
    },
  };
}

/**
 * 确定性 precheck：不花任何调用就能拒绝的空证据。
 *
 * 说实话：在 runner 路径上这一步是冗余的——parseCapabilityEvidenceEnvelope 本身就会
 * 拒绝空 evidence 数组与空 refs。保留它有两个理由：
 *   1. 直接传入已解析 envelope 的调用方（MCP / 将来的触发点）绕过了那层校验；
 *   2. 把"不给空证据花一次付费调用"写成可测的契约，而不是依赖另一个模块的副作用。
 */
export function precheckStageEvidence(envelope) {
  const evidence = Array.isArray(envelope?.evidence) ? envelope.evidence : [];
  if (evidence.length === 0) return { ok: false, reason: 'envelope carries no evidence items' };
  const withRefs = evidence.filter((item) => Array.isArray(item?.refs) && item.refs.some((ref) => String(ref || '').trim()));
  if (withRefs.length === 0) return { ok: false, reason: 'no evidence item carries a usable ref' };
  return { ok: true, reason: '', evidenceCount: evidence.length, referencedCount: withRefs.length };
}

function buildState({ command, envelope }) {
  return JSON.stringify({
    capability: command?.capabilityId || null,
    stage: command?.stageId || null,
    provider: command?.provider?.id || null,
    evidence: (envelope?.evidence || []).map((item) => ({ kind: item?.kind ?? null, refs: item?.refs ?? [] })),
  });
}

/**
 * 评估一次 rex 阶段推进。
 *
 * @param {object} options
 * @param {'advance'|'hold'} options.onError  判定客户端不可用时的取向；默认取配置值（hold）。
 * @param {'read-only'|'guarded'|'destructive'} options.riskClass  风险档位；只能抬高门槛。
 * @returns {Promise<{decision:'advance'|'hold', gate:string, reason:string,
 *                    judgment:object|null, availability:object, precheck:object|null}>}
 */
export async function evaluateStageAdvanceGate({
  command,
  output,
  envelope,
  env = process.env,
  homeDir,
  config,
  configPath,
  transport,
  session = createJudgmentSession(),
  onError,
  riskClass = 'guarded',
} = {}) {
  // 只读一次配置，availability 与 askJudgment 共用同一份快照，避免两次读取之间出现差异。
  const loaded = config ? { config } : readJudgmentConfig({ configPath, env, homeDir });
  const availability = resolveJudgmentAvailability({
    env,
    homeDir,
    config: loaded.config,
    configPath: configPath || loaded.path,
  });

  // 关闭时：不解析、不构造、不出网，调用方按原有逻辑继续。
  if (!availability.available) {
    return freeze({
      decision: 'advance',
      gate: 'disabled',
      reason: describeAvailability(availability),
      judgment: null,
      availability,
      precheck: null,
    });
  }

  let parsedEnvelope = envelope;
  if (!parsedEnvelope) {
    try {
      const { parseCapabilityEvidenceEnvelope } = await import('../workflows/rex-capability-runtime.mjs');
      parsedEnvelope = parseCapabilityEvidenceEnvelope(output, {
        activationId: command?.activationId,
        capabilityId: command?.capabilityId,
      });
    } catch (error) {
      return freeze({
        decision: 'advance',
        gate: 'unavailable',
        reason: `could not parse the evidence envelope (${error?.message || String(error)}); leaving the existing path in charge`,
        judgment: null,
        availability,
        precheck: null,
      });
    }
  }

  // 没有结构化信封时，原有路径本来就会拒绝摄取（missing-envelope），
  // 这里再花一次调用没有意义，也让闸门无法把"已拒绝"变成"放行"。
  if (!parsedEnvelope) {
    return freeze({
      decision: 'advance',
      gate: 'no-envelope',
      reason: 'no structured evidence envelope in the provider output; the existing missing-envelope path decides',
      judgment: null,
      availability,
      precheck: null,
    });
  }

  const precheck = precheckStageEvidence(parsedEnvelope);
  if (!precheck.ok) {
    return freeze({
      decision: 'hold',
      gate: 'precheck',
      reason: `held before spending a call: ${precheck.reason}`,
      judgment: null,
      availability,
      precheck,
    });
  }

  const result = await askJudgment({
    vendor: availability.vendor,
    state: buildState({ command, envelope: parsedEnvelope }),
    questions: buildStageGateQuestions(),
    config: loaded.config,
    configPath: availability.configPath,
    env,
    homeDir,
    transport,
    session,
  });

  if (!result.ok) {
    // 默认 fail closed：闸门开着却问不到，就不推进。取向可由配置/调用方覆盖。
    const policy = onError || availability.vendorConfig.onJudgmentError || 'hold';
    return freeze({
      decision: policy === 'allow' ? 'advance' : 'hold',
      gate: 'judgment-unavailable',
      reason: `judgment client refused the call (${result.reason}: ${result.message}); onJudgmentError=${policy}`,
      judgment: { ok: false, reason: result.reason, message: result.message, requestId: result.requestId || null },
      availability,
      precheck,
    });
  }

  const verdict = judgeVerdict({
    answer: result.answers[STAGE_GATE_QUESTION_ID],
    actFloor: availability.vendorConfig.actFloor,
    confirmFloor: availability.vendorConfig.confirmFloor,
    riskClass,
  });

  return freeze({
    decision: verdict.verdict === 'act' ? 'advance' : 'hold',
    gate: 'judgment',
    reason: verdict.reason,
    judgment: {
      ok: true,
      questionId: STAGE_GATE_QUESTION_ID,
      verdict: verdict.verdict,
      signal: verdict.signal,
      signalKind: verdict.signalKind,
      answer: verdict.answer,
      model: result.model,
      requestId: result.requestId,
      usage: result.usage,
      disposition: 'proposal-not-fact',
    },
    availability,
    precheck,
  });
}

function freeze(value) {
  return Object.freeze(value);
}
