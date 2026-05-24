/* 中文注释：Shell 层在命令输出边界截获 stdout/stderr，保留 ref 后只返回可行动摘要。 */
export { planShellInterception } from './shell-planner.mjs';
export { shrinkToolOutput } from './output-shrinker.mjs';
export { runShellEnvelope } from './shell-wrapper.mjs';
