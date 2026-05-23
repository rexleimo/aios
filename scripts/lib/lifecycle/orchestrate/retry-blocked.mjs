import { normalizeCounter, normalizePositiveInteger } from './shared.mjs';
import { buildRuntimeClientProviderMap } from '../../clients/registry.mjs';

function inferProviderFromClientId(clientId = '') {
  const normalized = String(clientId || '').trim().toLowerCase();
  return buildRuntimeClientProviderMap('all')[normalized] || '';
}

// 纯函数：从 learn-eval 报告中抽取 retry-blocked 需要的 dispatch hindsight 摘要。
export function extractDispatchHindsightSummary(learnEvalReport) {
  const hindsight = learnEvalReport?.signals?.dispatch?.hindsight;
  return {
    pairsAnalyzed: normalizeCounter(hindsight?.pairsAnalyzed),
    repeatedBlockedTurns: normalizeCounter(hindsight?.repeatedBlockedTurns),
    regressions: normalizeCounter(hindsight?.regressions),
  };
}

// 纯函数：把不稳定 hindsight 信号集中为一个阻断判断，避免 runOrchestrate 内联 if 分叉膨胀。
export function isRetryBlockedDispatchUnstable(hindsightSummary) {
  return normalizeCounter(hindsightSummary?.pairsAnalyzed) > 0
    && (normalizeCounter(hindsightSummary?.repeatedBlockedTurns) > 0 || normalizeCounter(hindsightSummary?.regressions) > 0);
}

// 纯函数：根据当前客户端和并发配置生成恢复命令，覆盖 codex/claude/gemini/opencode 四类客户端。
export function buildRetryBlockedRecoveryCommands(sessionId, env = process.env) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return [];

  const commands = [
    `node scripts/aios.mjs learn-eval --session ${normalizedSessionId}`,
    `node scripts/aios.mjs orchestrate --session ${normalizedSessionId} --dispatch local --execute dry-run --format json`,
    `node scripts/aios.mjs hud --session ${normalizedSessionId} --preset full`,
  ];

  const provider = inferProviderFromClientId(env?.AIOS_SUBAGENT_CLIENT || '');
  const workers = normalizePositiveInteger(env?.AIOS_SUBAGENT_CONCURRENCY, 2);
  if (provider) {
    commands.splice(
      2,
      0,
      `node scripts/aios.mjs team --resume ${normalizedSessionId} --retry-blocked --provider ${provider} --workers ${workers} --dry-run`
    );
  }

  return commands;
}
