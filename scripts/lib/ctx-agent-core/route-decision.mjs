import { normalizeRouteMode } from './route-normalizers.mjs';

const TEAM_ROUTE_KEYWORD_PATTERNS = [
  /并行|并发|同时推进|拆分|多模块|跨模块|跨系统|多阶段/u,
  /subagent|agent\s*team|multi[-\s]?agent|parallel|split/i,
  /frontend|backend|api|database|测试|test|文档|docs/i,
];
const HARNESS_ROUTE_KEYWORD_PATTERN = /\b(harness|overnight|long[-\s]?running|resumable|resume|checkpoint|journal|handoff)\b|过夜|长任务|长期|可恢复|恢复|持续推进|交接|迭代|检查点/iu;

function countListMarkers(prompt = '') {
  const lines = String(prompt || '').split(/\r?\n/u);
  let count = 0;
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (trimmed && /^(\d+[\.)]|[-*+])\s+/u.test(trimmed)) count += 1;
  }
  return count;
}

function buildTeamRouteSignal(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) {
    return { score: 0, keywords: 0, listMarkers: 0, length: 0, shouldRoute: false, reason: 'empty prompt' };
  }

  const keywords = TEAM_ROUTE_KEYWORD_PATTERNS.reduce((acc, pattern) => (pattern.test(text) ? acc + 1 : acc), 0);
  const listMarkers = countListMarkers(text);
  const length = text.length;
  let score = 0;
  if (keywords >= 2) score += 2;
  if (listMarkers >= 2) score += 1;
  if (keywords >= 1 && listMarkers >= 2) score += 1;
  if (length >= 180) score += 1;
  if (/同时|并行|parallel|multi[-\s]?(step|stage|module)/iu.test(text)) score += 1;

  const strongTeamIntent = /并行|并发|parallel|multi[-\s]?agent|agent\s*team|跨模块|多模块|跨系统/iu.test(text);
  let recommendedRoute = 'single';
  if (strongTeamIntent && (keywords >= 1 || listMarkers >= 2)) recommendedRoute = 'team';
  else if (score >= 4) recommendedRoute = 'team';
  else if (score >= 2) recommendedRoute = 'subagent';

  return {
    score,
    keywords,
    listMarkers,
    length,
    shouldRoute: recommendedRoute !== 'single',
    recommendedRoute,
    reason: `${recommendedRoute} score=${score} (keywords=${keywords}, listMarkers=${listMarkers}, length=${length})`,
  };
}

export function resolveTaskRouteDecision({ prompt = '', routeMode = 'auto' } = {}) {
  const rawPrompt = String(prompt || '').trim();
  const normalizedRouteMode = normalizeRouteMode(routeMode);
  const commandMatch = /^\/(single|team|subagent|harness)\b[:\s-]*/iu.exec(rawPrompt);

  if (commandMatch) {
    const commandRoute = normalizeRouteMode(commandMatch[1]);
    const stripped = rawPrompt.slice(commandMatch[0].length).trim();
    return { routeMode: commandRoute, taskPrompt: stripped || rawPrompt, explicitTrigger: true, reason: `prompt trigger /${commandRoute}`, signal: null };
  }
  if (normalizedRouteMode !== 'auto') {
    return { routeMode: normalizedRouteMode, taskPrompt: rawPrompt, explicitTrigger: true, reason: `flag route=${normalizedRouteMode}`, signal: null };
  }
  if (HARNESS_ROUTE_KEYWORD_PATTERN.test(rawPrompt)) {
    return { routeMode: 'harness', taskPrompt: rawPrompt, explicitTrigger: false, reason: 'harness keyword signal', signal: { recommendedRoute: 'harness' } };
  }

  const signal = buildTeamRouteSignal(rawPrompt);
  if (signal.shouldRoute) {
    return { routeMode: signal.recommendedRoute === 'team' ? 'team' : 'subagent', taskPrompt: rawPrompt, explicitTrigger: false, reason: signal.reason, signal };
  }
  return { routeMode: 'single', taskPrompt: rawPrompt, explicitTrigger: false, reason: signal.reason, signal };
}
