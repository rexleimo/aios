// 示例插件的 provider 脚本：在独立子进程跑，RPC 响应模型/供应商列表。
// 数据来自本机真实 model-registry.json（由 AIOS_PROJECT_ROOT 指定）。
import fs from 'node:fs';
import path from 'node:path';

const rootDir = String(process.env.AIOS_PROJECT_ROOT || process.cwd());
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let request;
  try { request = JSON.parse(raw.trim() || '{}'); } catch { process.stdout.write(`${JSON.stringify({ ok: false, error: 'bad request' })}\n`); return; }
  let doc = { providers: {}, models: {} };
  try { doc = JSON.parse(fs.readFileSync(path.join(rootDir, 'memory', 'specs', 'model-registry.json'), 'utf8')); } catch { /* fail-open */ }
  const method = String(request.method || '');
  if (method === 'models') {
    process.stdout.write(`${JSON.stringify({ ok: true, data: Object.entries(doc.models || {}).map(([id, v]) => ({ id, provider: v?.provider || '' })) })}\n`);
  } else if (method === 'providers') {
    process.stdout.write(`${JSON.stringify({ ok: true, data: Object.keys(doc.providers || {}) })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ ok: false, error: 'unknown method' })}\n`);
  }
});
