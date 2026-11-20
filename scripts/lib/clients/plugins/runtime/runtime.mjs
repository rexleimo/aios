// runtime/runtime.mjs — 进程内受限 JS 运行时（P1, G1）。
// 用 Node 原生 vm 跑插件代码；能力受限、clone 结果、失败 fail-open。
// 纪律：业务代码零 try-catch——所有会抛的外部调用经 core/result.mjs 的 attempt 包成 Result，
// 分支用 ts-pattern 的 match 链式分派，不用 if-else 级联。
import vm from 'node:vm';
import { match } from 'ts-pattern';

import { attempt, mapErr, ok } from '../core/result.mjs';

export const DEFAULT_HOOK_TIMEOUT_MS = 250;
export const DEFAULT_EVENT_TIMEOUT_MS = 50;

/** 深拷贝一个可 JSON 化的值；失败视为非法返回。 */
function clone(value) {
  if (value === undefined) return ok(undefined);
  return mapErr(attempt(() => structuredClone(value)), 'hook result is not cloneable');
}

/**
 * 在受限上下文运行插件源码并调用具名 hook。
 * @returns {{ok:true,value:unknown}|{ok:false,error:string}}
 */
export function runHookInSandbox({ source, hook, args = [], timeoutMs = DEFAULT_HOOK_TIMEOUT_MS } = {}) {
  if (typeof source !== 'string' || !source.trim()) return ok(undefined);
  const sandbox = Object.freeze({
    console: Object.freeze({ log: () => {}, warn: () => {}, error: () => {} }),
  });
  const contextResult = attempt(() => vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } }));
  if (!contextResult.ok) return mapErr(contextResult, 'failed to create sandbox context');

  const scriptResult = attempt(() => new vm.Script(`(function(){ ${source}\n return typeof ${hook} === 'function' ? ${hook} : undefined; })()`, { filename: 'plugin-hook.js' }));
  if (!scriptResult.ok) return mapErr(scriptResult, 'plugin source is not valid JS');

  const fnResult = attempt(() => scriptResult.value.runInContext(contextResult.value, { timeout: timeoutMs }));
  if (!fnResult.ok) return mapErr(fnResult, 'plugin hook failed to load');
  if (typeof fnResult.value !== 'function') return ok(undefined);

  const argsClone = clone(args);
  if (!argsClone.ok) return argsClone;
  const callResult = attempt(() => fnResult.value(...argsClone.value));
  if (!callResult.ok) return mapErr(callResult, `hook ${hook} threw`);
  return clone(callResult.value);
}

/** fail-open 包装：任何失败都返回 fallback。 */
export function runHookFailOpen(options, fallback) {
  const result = runHookInSandbox(options);
  return match(result)
    .with({ ok: true }, ({ value }) => ({ value: value === undefined ? fallback : value, failed: false }))
    .with({ ok: false }, ({ error }) => ({ value: fallback, failed: true, reason: error }))
    .exhaustive();
}
