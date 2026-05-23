import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getClientRuntimeId } from '../../clients/registry.mjs';

const STRUCTURED_OUTPUT_CLIENT_ID = getClientRuntimeId('codex');
const STRUCTURED_OUTPUT_TEMP_PREFIX = 'aios-codex-last-message-';

// 纯函数：判断某个 runtime client 是否支持结构化 last-message 输出。
export function shouldUseClientStructuredOutput(clientId = '') {
  return String(clientId || '').trim().toLowerCase() === STRUCTURED_OUTPUT_CLIENT_ID;
}

// 纯函数：根据调用方准备好的路径组装结构化输出参数，不在这里访问文件系统。
export function buildClientStructuredOutputOptions({
  clientId = '',
  tempDir = '',
  schemaPath = '',
  lastMessagePath = '',
  color = 'never',
} = {}) {
  if (!shouldUseClientStructuredOutput(clientId) || !tempDir || !schemaPath || !lastMessagePath) {
    return null;
  }

  return {
    schemaPath,
    lastMessagePath,
    color,
  };
}

// 副作用函数：只有支持结构化输出的客户端才创建临时目录，避免主流程出现客户端分支。
export async function createClientStructuredOutputTempDir(clientId = '') {
  if (!shouldUseClientStructuredOutput(clientId)) return null;
  return fs.mkdtemp(path.join(os.tmpdir(), STRUCTURED_OUTPUT_TEMP_PREFIX));
}

// 副作用函数：清理结构化输出临时目录；清理失败不阻断主流程。
export async function cleanupClientStructuredOutputTempDir(tempDir = '') {
  if (!tempDir) return;
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 最佳努力清理，Windows 上临时文件句柄短暂占用时不让任务失败。
  }
}
