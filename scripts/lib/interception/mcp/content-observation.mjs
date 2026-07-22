/* 中文注释：观测投影与 MCP 协议载荷分离，任何二进制内容都不能进入 refs 或 metrics。 */
const BINARY_KEYS = new Set(['base64', 'blob', 'data', 'payload']);

export function buildToolCallObservation(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
    return '[MCP result without observable content]';
  }
  return result.content.map(describeContentBlock).join('\n');
}

function describeContentBlock(block) {
  if (!isObjectRecord(block)) return '[unknown MCP content block]';
  if (block.type === 'text') return String(block.text ?? '');

  if (block.type === 'image' || block.type === 'audio') {
    return formatDescriptor(block.type, block.mimeType || block.mime_type, block.data);
  }

  if (block.type === 'resource') {
    const resource = isObjectRecord(block.resource) ? block.resource : {};
    return formatDescriptor('resource', resource.mimeType || resource.mime_type, resource.blob || resource.data, resource.uri);
  }

  const keys = Object.keys(block)
    .filter((key) => key !== 'type' && !BINARY_KEYS.has(key))
    .sort();
  return `[${String(block.type || 'unknown')} content keys=${keys.join(',') || 'none'}]`;
}

function formatDescriptor(type, mimeType, data, uri = '') {
  const details = [String(type || 'unknown')];
  if (mimeType) details.push(String(mimeType));
  if (uri) details.push(String(uri));
  details.push(`${byteLength(data)} bytes`);
  return `[${details.join(' ')}]`;
}

function byteLength(value) {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
  if (value instanceof Uint8Array) return value.byteLength;
  return 0;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
