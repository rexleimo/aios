import assert from 'node:assert/strict';
import test from 'node:test';

import { queryPluginProviders, resolveProviderEntry } from '../../../lib/clients/plugins/adapters/provider.mjs';

test('provider adapter: 相对 dir 解析插件脚本路径', () => {
  const p = resolveProviderEntry({ rootDir: '/proj', plugin: 'p', dir: 'examples/p', entry: 'provider.mjs' });
  assert.equal(p.ok, true);
  assert.equal(p.value, '/proj/examples/p/provider.mjs');
});

test('provider adapter: 无 dir 退回 plugin id；缺 entry 返回 err', () => {
  const p = resolveProviderEntry({ rootDir: '/proj', plugin: 'p', entry: 'provider.mjs' });
  assert.equal(p.value, '/proj/p/provider.mjs');
  const missing = resolveProviderEntry({ rootDir: '/proj', plugin: 'p', entry: '' });
  assert.equal(missing.ok, false);
});

test('provider adapter: 真实子进程 RPC 读插件声明的 provider 数据', async () => {
  const rootDir = process.cwd().replace(/\/scripts\/tests\/tooling\/plugins$/u, '');
  // 用工作区真实示例插件的脚本
  const result = await queryPluginProviders({
    rootDir,
    sources: [{ plugin: 'hello-plugin', dir: 'examples/hello-plugin', entry: 'provider.mjs' }],
    method: 'models',
  });
  assert.equal(result[0].ok, true);
  assert.ok(result[0].data.length > 0);
});
