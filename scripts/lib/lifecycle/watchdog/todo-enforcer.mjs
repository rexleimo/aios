/* 中文注释：Todo Enforcer 只处理 idle 识别和 nudge 循环，不参与 watchdog 恢复决策。 */
import { IDLE_DEFAULTS } from './constants.mjs';
import { collectWatchdogSignals } from './signals.mjs';
import { normalizeNonNegativeInteger, normalizeText } from './shared.mjs';

export function buildIdleDetector(options = {}) {
  const checkIntervalSeconds = normalizeNonNegativeInteger(options.checkIntervalSeconds, IDLE_DEFAULTS.checkIntervalSeconds);
  const idleThresholdSeconds = normalizeNonNegativeInteger(options.idleThresholdSeconds, IDLE_DEFAULTS.idleThresholdSeconds);
  const maxNudgeCount = normalizeNonNegativeInteger(options.maxNudgeCount, IDLE_DEFAULTS.maxNudgeCount);
  const nudgeMessage = normalizeText(options.nudgeMessage) || IDLE_DEFAULTS.nudgeMessage;
  return { checkIntervalSeconds, idleThresholdSeconds, maxNudgeCount, nudgeMessage };
}

export function detectIdleState(signals, idleConfig = IDLE_DEFAULTS) {
  const idleSeconds = idleConfig.idleThresholdSeconds || IDLE_DEFAULTS.idleThresholdSeconds;
  const idleThresholdMs = idleSeconds * 1000;
  const commitAgeMs = (signals.commitAgeMinutes ?? Infinity) * 60000;
  const fileAgeMs = (signals.fileActivityAgeMinutes ?? Infinity) * 60000;
  const logAgeMs = (signals.logAgeMinutes ?? Infinity) * 60000;
  const isIdle = commitAgeMs >= idleThresholdMs && fileAgeMs >= idleThresholdMs && logAgeMs >= idleThresholdMs;
  const cpuActive = signals.cpuState === 'active';
  return {
    isIdle: isIdle && !cpuActive,
    idleSeconds: Math.min(commitAgeMs, fileAgeMs, logAgeMs) / 1000,
    thresholdSeconds: idleSeconds,
    signals: { commitAgeMs, fileAgeMs, logAgeMs, cpuActive },
  };
}

export function decideNudgeAction(idleState, nudgeCount = 0, config = IDLE_DEFAULTS) {
  const max = config.maxNudgeCount || IDLE_DEFAULTS.maxNudgeCount;
  if (!idleState.isIdle) {
    return { action: 'none', reason: 'agent is active', nudgeCount };
  }
  if (nudgeCount >= max) {
    return {
      action: 'blocked',
      reason: `agent idle after ${nudgeCount} nudges (max=${max}), escalating to blocked`,
      nudgeCount,
      message: `Agent has been idle for ${Math.round(idleState.idleSeconds)}s after ${nudgeCount} nudges. Operator intervention required.`,
    };
  }
  return {
    action: 'nudge',
    reason: `agent idle for ${Math.round(idleState.idleSeconds)}s (threshold=${idleState.thresholdSeconds}s), sending nudge ${nudgeCount + 1}/${max}`,
    nudgeCount: nudgeCount + 1,
    message: config.nudgeMessage || IDLE_DEFAULTS.nudgeMessage,
  };
}

export async function runTodoEnforcerLoop(options = {}, { rootDir, io = console } = {}) {
  const config = buildIdleDetector(options);
  const maxIterations = normalizeNonNegativeInteger(options.maxIterations, 100);
  let nudgeCount = normalizeNonNegativeInteger(options.initialNudgeCount, 0);
  const sessionId = normalizeText(options.sessionId);

  let runContextDbCli = null;
  try {
    ({ runContextDbCli } = await import('../../contextdb-cli.mjs'));
  } catch {
    /* 中文注释：ContextDB 不可用时保持 nudge 日志输出，避免 enforcer 因遥测失败停摆。 */
  }

  for (let i = 0; i < maxIterations; i++) {
    const signals = await collectWatchdogSignals({
      rootDir,
      sessionId,
      workspaceRoot: options.workspaceRoot || rootDir,
    });
    const idleState = detectIdleState(signals, config);
    const action = decideNudgeAction(idleState, nudgeCount, config);

    if (action.action === 'none') {
      nudgeCount = 0;
    } else if (action.action === 'nudge') {
      nudgeCount = action.nudgeCount;
      io.log(`[todo-enforcer] ${action.reason}`);
      io.log(`[todo-enforcer] nudge: ${action.message}`);
      if (runContextDbCli) {
        try {
          runContextDbCli([
            'event:add', '--workspace', rootDir || process.cwd(),
            '--session', sessionId || 'default',
            '--role', 'system', '--kind', 'enforcer.nudge',
            '--text', JSON.stringify({ message: action.message, nudgeCount, idleSeconds: idleState.idleSeconds }),
            '--turn-id', `enforcer-${Date.now().toString(36)}`,
          ]);
        } catch {
          /* 中文注释：nudge 遥测是 best-effort，失败不阻塞循环。 */
        }
      }
    } else if (action.action === 'blocked') {
      io.log(`[todo-enforcer] ${action.reason}`);
      io.log(`[todo-enforcer] BLOCKED: ${action.message}`);
      return { exitCode: 2, action: 'blocked', nudgeCount, idleState };
    }

    const waitMs = (config.checkIntervalSeconds || IDLE_DEFAULTS.checkIntervalSeconds) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return { exitCode: 0, action: 'completed', nudgeCount };
}
