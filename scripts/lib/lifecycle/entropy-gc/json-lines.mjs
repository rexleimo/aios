/* 中文注释：JSONL 读取独立封装，扫描逻辑无需关心文件缺失和行解析细节。 */
import { promises as fs } from 'node:fs';

export function readJsonLines(raw = '') {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function readJsonLinesOptional(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return readJsonLines(raw);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
