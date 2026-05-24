/* 中文注释：核心层定义拦截数据契约，把原始输出标准化成可压缩、可计量的 envelope。 */
/* 中文注释：envelope 用 base64url 是为了安全穿过 shell 参数边界，避免 JSON 引号被不同 shell 重新解释。 */
export function encodeEnvelope(value) {
  return Buffer.from(JSON.stringify(value ?? {}), 'utf8').toString('base64url');
}

/* 中文注释：CLI 入口只负责解 envelope，真正的安全检查和压缩仍交给 shell wrapper 与 engine。 */
export function decodeEnvelope(encoded) {
  if (!encoded) throw new TypeError('envelope is required');
  const raw = Buffer.from(String(encoded), 'base64url').toString('utf8');
  return JSON.parse(raw);
}
