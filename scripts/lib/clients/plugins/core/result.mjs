// core/result.mjs — Result 类型（单一事实源），替代用异常做控制流。
// 业务函数返回 {ok:true,value} 或 {ok:false,error}，不抛异常、不用 try-catch 做分支。
// attempt 是唯一捕获外部异常的边界集中点（vm/fs/JSON.parse 等会抛的第三方调用由此进入）。

import fs from 'node:fs';

export const ok = (value) => Object.freeze({ ok: true, value });
export const err = (error) => Object.freeze({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
});

/** 把可能抛异常的外部调用包成 Result。唯一允许捕获异常的地方。 */
export function attempt(fn) {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

/** 异步版 attempt。 */
export async function attemptAsync(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}

/** 读文件并 JSON.parse，缺文件返回可选 empty，其它失败返回 err。 */
export function readJson(filePath, { readFileImpl = fs.readFileSync, empty = null } = {}) {
  const read = attempt(() => readFileImpl(filePath, 'utf8'));
  if (!read.ok) {
    const isMissing = /ENOENT|ENOTDIR/u.test(read.error);
    return isMissing && empty !== null ? ok(empty) : read;
  }
  const parsed = attempt(() => JSON.parse(String(read.value).replace(/^\uFEFF/u, '')));
  return parsed.ok ? parsed : err(`${filePath} is not valid JSON`);
}

/** 提取 error 消息（供 pattern match 用）。 */
export function errorOf(result) {
  return result.ok ? '' : result.error;
}

/** Result 错误映射：成功透传，失败替换消息。 */
export function mapErr(result, message) {
  return result.ok ? result : err(message);
}

/** fail-open：失败时取 fallback。 */
export function withFallback(result, fallback) {
  return result.ok ? result.value : fallback;
}
