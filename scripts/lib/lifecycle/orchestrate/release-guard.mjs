export const PREFLIGHT_RELEASE_GUARD_SOURCE_ID = 'gate.release-health';
export const PREFLIGHT_RELEASE_GUARD_COMMAND = 'node scripts/aios.mjs release-status --strict --format json';

// 纯函数：识别“release state 尚未生成”的可跳过状态，避免 preflight 把首次运行误判成失败。
export function isReleaseStateUnavailable(result = {}) {
  return result?.ok === false && /state file not found/i.test(String(result?.error || ''));
}

// 纯函数：统一生成 release strict gate 的预检动作，方便 auto preflight 和阻断策略复用。
export function buildReleaseGuardAction() {
  return {
    type: 'command',
    sourceId: PREFLIGHT_RELEASE_GUARD_SOURCE_ID,
    action: PREFLIGHT_RELEASE_GUARD_COMMAND,
  };
}

// 纯函数：判断 dispatch preflight 中 release guard 是否失败，屏蔽调用方对结果结构的依赖。
export function didReleaseGuardFail(dispatchPreflight = null) {
  if (!dispatchPreflight || !Array.isArray(dispatchPreflight.results)) return false;
  return dispatchPreflight.results.some(
    (item) => item?.sourceId === PREFLIGHT_RELEASE_GUARD_SOURCE_ID && item?.status === 'failed'
  );
}

// 纯函数：把 release guard 失败合并到 dispatch policy，让策略治理不散落在 runOrchestrate 主流程里。
export function applyReleaseGuardBlock(policy = null, dispatchPreflight = null) {
  if (!policy || typeof policy !== 'object') return policy;
  if (!didReleaseGuardFail(dispatchPreflight)) {
    return policy;
  }

  const blockerIds = [...new Set([...(Array.isArray(policy.blockerIds) ? policy.blockerIds : []), PREFLIGHT_RELEASE_GUARD_SOURCE_ID])];
  const requiredActions = Array.isArray(policy.requiredActions) ? [...policy.requiredActions] : [];
  if (!requiredActions.some((item) => item?.sourceId === PREFLIGHT_RELEASE_GUARD_SOURCE_ID)) {
    requiredActions.push(buildReleaseGuardAction());
  }
  const notes = Array.isArray(policy.notes) ? [...policy.notes] : [];
  notes.push('Preflight release health guard failed: resolve release-status strict gate before continuing.');

  return {
    ...policy,
    status: 'blocked',
    parallelism: 'serial-only',
    blockerIds,
    requiredActions,
    notes,
  };
}
