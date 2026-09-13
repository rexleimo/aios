/* 中文注释：Turn 契约桥（借鉴 LoopX settlement，见 docs/plans/2026-09-12-loopx-adoption-turn-contract-cadence-unattended.md）。
 * harness 迭代契约 → rex.turn-result.v1 envelope → 独立 verify 进程放行 → settle 进程结算。
 * 映射只读 agent 显式声明的 outcome/failureClass/shouldStop 字段，不做任何文本猜测。 */
import { deriveEffectRef, normalizeTurnResult } from '../../../rex-harness/src/domain/turn-contract.mjs';
import { captureCommand } from '../platform/process.mjs';
import { normalizeText } from './solo-runtime/normalizers.mjs';

/** harness failureClass → turn contract failureKind 的声明映射表。 */
const FAILURE_CLASS_TO_FAILURE_KIND = Object.freeze({
  none: 'none',
  'no-progress': 'none',
  'tool-error': 'unknown',
  'runtime-error': 'unknown',
  'rate-limited': 'rate_limited',
  'provider-overloaded': 'provider_overloaded',
  'host-unsupported': 'host_unsupported',
  'budget-exhausted': 'budget_exhausted',
  'workspace-mutation': 'unknown',
  'ownership-gate': 'ownership_gate',
  'safety-gate': 'safety_gate',
  'stop-requested': 'none',
});

/**
 * 声明字段映射：只有 success 才可能产生 material turn（validated_progress /
 * validated_completion）；其余一律 blocked——失败轮不得自证进展。
 */
export function mapIterationToTurnContract({ outcome, shouldStop = false, failureClass = 'none' } = {}) {
  const normalizedOutcome = normalizeText(outcome);
  const normalizedClass = normalizeText(failureClass, 'none');
  const failureKind = FAILURE_CLASS_TO_FAILURE_KIND[normalizedClass] ?? 'unknown';

  if (normalizedOutcome === 'success') {
    return {
      turnOutcome: shouldStop === true ? 'validated_completion' : 'validated_progress',
      failureKind,
    };
  }
  return { turnOutcome: 'blocked', failureKind };
}

/**
 * 组装并校验 rex.turn-result.v1 envelope。
 * evidence 必须是结构化 {kind, refs[]}（rex 证据契约）；material 声明缺证据时
 * normalizeTurnResult 直接抛错——fail-closed。
 */
export function buildTurnEnvelope({
  activationId,
  executionToken,
  iteration,
  outcome,
  shouldStop = false,
  failureClass = 'none',
  summary = '',
  blockedReason = '',
  evidence = [],
  bypass = false,
} = {}) {
  const { turnOutcome, failureKind } = mapIterationToTurnContract({ outcome, shouldStop, failureClass });
  const normalizedIteration = Number.isFinite(iteration) ? Math.max(1, Math.floor(iteration)) : 1;
  const bare = {
    kind: 'rex.turn-result.v1',
    turnKey: { workflowActivationId: normalizeText(activationId), iteration: normalizedIteration },
    outcome: turnOutcome,
    failureKind,
    selfReport: {
      progressMade: turnOutcome === 'validated_progress' || turnOutcome === 'validated_completion',
      blockedReason: normalizeText(blockedReason) || (turnOutcome === 'blocked' ? normalizeText(summary, 'no-progress') : ''),
      summary: normalizeText(summary),
    },
    evidence: Array.isArray(evidence) ? evidence : [],
    bypass: bypass === true,
    commandToken: normalizeText(executionToken),
  };
  return normalizeTurnResult({
    ...bare,
    effectRef: deriveEffectRef({ executionToken: bare.commandToken, turnResult: bare }),
  });
}

function runRexCommand(rootDir, subcommand, envelope, { runCommand = captureCommand } = {}) {
  const rexEntry = 'rex-harness/bin/rex-harness.mjs';
  return runCommand(process.execPath, [rexEntry, subcommand, '--root', rootDir], {
    cwd: rootDir,
    encoding: 'utf8',
    input: `${JSON.stringify(envelope)}\n`,
  });
}

/**
 * 独立 validator 放行门：exit 0 才算过。executor 不得自验完成声明。
 * 返回 {passed, exitCode, rejections, report}。
 */
export function verifyTurnEnvelope({ rootDir, envelope, runCommand } = {}) {
  const result = runRexCommand(rootDir, 'verify', envelope, { runCommand });
  let report = null;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    report = null;
  }
  return {
    passed: result.status === 0,
    exitCode: result.status,
    rejections: report?.rejections || [`verify_process_failed: ${normalizeText(result.stderr, 'no output')}`],
    report,
  };
}

/**
 * verify 放行后调用 settle 结算。verify 失败时绝不调用 settle（fail-closed），
 * 返回 {gate: 'blocked'}；verify 通过才返回 {gate: 'passed', settlement}。
 */
export function settleTurnEnvelope({ rootDir, envelope, runCommand } = {}) {
  const gate = verifyTurnEnvelope({ rootDir, envelope, runCommand });
  if (!gate.passed) {
    return { gate: 'blocked', verify: gate, settlement: null };
  }
  const result = runRexCommand(rootDir, 'settle', envelope, { runCommand });
  let settlement = null;
  try {
    settlement = JSON.parse(result.stdout || '{}');
  } catch {
    settlement = null;
  }
  return {
    gate: 'passed',
    verify: gate,
    settlement,
    exitCode: result.status,
  };
}
