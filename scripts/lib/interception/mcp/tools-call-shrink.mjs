/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
/* 中文注释：MCP content 可能是 text/image/结构化对象；先统一成可压缩文本，图片只保留类型和字节量。 */
export function extractToolCallText(result) {
  if (!result || typeof result !== 'object') return stringify(result);
  if (Array.isArray(result.content)) {
    return result.content.map(item => {
      if (item?.type === 'text') return String(item.text ?? '');
      if (item?.type === 'image') return `[image ${item.mimeType || item.mime_type || ''} ${byteLength(item.data || '')} bytes]`;
      return stringify(item);
    }).join('\n');
  }
  return stringify(result);
}

/* 中文注释：兜底序列化必须稳定，不然 proof 的 raw_bytes 和 hash 会随对象类型不可控变化。 */
function stringify(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

/* 中文注释：图片/base64 不直接进入 packet，只记录大小，原始内容由上层 raw ref 保留。 */
function byteLength(value) {
  return Buffer.byteLength(String(value), 'utf8');
}
