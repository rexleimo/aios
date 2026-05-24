/* 中文注释：solo journal 基础 IO 独立封装，便于写入层复用原子写。 */
import { readFile } from 'node:fs/promises';

export async function safeReadJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function renderObjectiveMarkdown({ objective = '', provider = '', profile = '' } = {}) {
  return [
    '# Solo Harness Objective',
    '',
    `- Objective: ${String(objective || '').trim() || '(empty)'}`,
    `- Provider: ${String(provider || '').trim() || '(unknown)'}`,
    `- Profile: ${String(profile || '').trim() || '(unknown)'}`,
    '',
  ].join('\n');
}
