#!/usr/bin/env node
// provider 插件子进程入口：从 stdin 读一行 JSON-RPC 请求，处理后向 stdout 写一行 JSON 响应。
// 真实数据来自 workspace 的 model-registry.json（由 AIOS_PROJECT_ROOT 指定）。
import fs from 'node:fs';
import path from 'node:path';

import { handleProviderRpc } from '../builtin-provider.mjs';
import { attempt } from '../core/result.mjs';
import { match } from 'ts-pattern';

const rootDir = String(process.env.AIOS_PROJECT_ROOT || process.cwd());
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  const requestResult = attempt(() => JSON.parse(raw.trim() || '{}'));
  const response = match(requestResult)
    .with({ ok: false }, () => ({ ok: false, error: 'invalid JSON-RPC request' }))
    .with({ ok: true }, ({ value }) => handleProviderRpc({ rootDir, method: String(value.method || ''), params: value.params || {}, readFileImpl: fs.readFileSync }))
    .exhaustive();
  process.stdout.write(`${JSON.stringify(response)}\n`);
});
