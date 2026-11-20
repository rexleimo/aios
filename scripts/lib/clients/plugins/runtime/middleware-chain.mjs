// scripts/lib/clients/plugins/middleware-chain.mjs — G1 middleware 链（P1）。
// 按插件顺序跑 onRequest：返回新 body 则采用，undefined 保留，失败 fail-open 不改请求。
// 只改请求体，不改 model/stream（受保护字段改了按失败回滚）——与 magpie 的回滚语义一致。
import { runHookFailOpen } from './runtime.mjs';

export const PROTECTED_FIELDS = Object.freeze(['model', 'stream', 'tools', 'tool_choice']);

/**
 * 跑 onRequest 链。
 * @param {{body:object, ctx:object, hooks:Array<{id:string,source:string,hook?:string}>}}
 * @returns {{body:object, results:Array<{id:string,failed:boolean,reason?:string,rejected?:boolean}>}}
 */
export function runRequestChain({ body, ctx = {}, hooks = [] } = {}) {
  let current = body;
  const results = [];
  for (const entry of hooks) {
    const outcome = runHookFailOpen(
      { source: entry.source, hook: entry.hook || 'onRequest', args: [current, ctx] },
      undefined,
    );
    const candidate = outcome.value;
    if (outcome.failed) {
      results.push({ id: entry.id, failed: true, reason: outcome.reason });
      continue;
    }
    if (candidate === undefined) {
      results.push({ id: entry.id, failed: false });
      continue;
    }
    // 受保护字段被改 → 回滚（按失败处理，不采用该插件的修改）。
    const changedProtected = PROTECTED_FIELDS.some((field) => JSON.stringify(candidate[field]) !== JSON.stringify(body[field]));
    if (changedProtected) {
      results.push({ id: entry.id, failed: true, reason: 'changed protected field' });
      continue;
    }
    current = candidate;
    results.push({ id: entry.id, failed: false, applied: true });
  }
  return { body: current, results };
}
