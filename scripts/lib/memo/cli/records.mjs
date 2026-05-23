import { sanitizeWorkspaceMemorySpaceForSessionId } from '../workspace-memory.mjs';

// 纯函数：从 memo 文本中提取 #tag，保持新增、搜索和旧格式镜像的标签规则一致。
export function extractTags(text) {
  const tags = new Set();
  const input = String(text ?? '');
  const matches = input.matchAll(/#([\p{L}\p{N}_-]+)/gu);
  for (const match of matches) {
    const tag = String(match[1] || '').trim();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
}

export function createMemoTurnId(space = '') {
  const normalizedSpace = sanitizeWorkspaceMemorySpaceForSessionId(space) || 'default';
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `memo:${normalizedSpace}:${stamp}`;
}
