import { normalizeRouteMode } from './route-normalizers.mjs';

/* 北极星原则：程序只做确定性路由，绝不用关键词/复杂度打分从自由文本猜
 * "这个任务该走 single/team/subagent/harness"。
 *
 * 本模块只认两类确定性输入：
 *  1) 显式命令前缀：/single | /team | /subagent | /harness（协议化，保留）
 *  2) 显式 routeMode flag（非 auto，保留）
 * 其余情况（auto 且无显式声明）一律回退 single，明确说明"程序没有猜"，
 * 由调用方/模型显式声明团队或长任务路由。
 */

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
  // auto 且无显式命令/flag：程序不猜路由，回退 single。
  return {
    routeMode: 'single',
    taskPrompt: rawPrompt,
    explicitTrigger: false,
    reason: 'no explicit route declared; program does not guess single/team/subagent/harness from free text',
    signal: { recommendedRoute: 'single' },
  };
}
