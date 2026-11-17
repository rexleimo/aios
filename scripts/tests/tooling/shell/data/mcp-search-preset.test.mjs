import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { searchMcpPreset } from '../../../../../apps/shell/ui/src/lib/data/mcp-presets.mjs';

test('search preset uses the resolved runtime and never sends environment credentials to the browser', () => {
  const rootDir = path.resolve('/fixture/project');
  const installed = path.resolve('/fixture/runtime');
  const files = new Set(['aios.mjs', 'aios-search-mcp.mjs'].map(name => path.join(installed, 'scripts', name)));
  const result = searchMcpPreset({ rootDir, env: { HOME: '/fixture/home', AIOS_ROOT_DIR: installed, DEEPSEEK_API_KEY: 'fake-never-return' }, exists: file => files.has(file), node: '/fixture/node' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.preset.entry, { type: 'stdio', command: '/fixture/node', args: [path.join(installed, 'scripts/aios-search-mcp.mjs')] });
  assert.deepEqual(result.preset.requiredEnv, ['DEEPSEEK_API_KEY']);
  assert.doesNotMatch(JSON.stringify(result), /fake-never-return/);
  assert.equal(Object.hasOwn(result.preset.entry, 'env'), false);
  assert.match(result.preset.costNotice, /成功且非空/u);
  assert.match(result.preset.costNotice, /人民币 5 元/u);
  assert.match(result.preset.costNotice, /美元 0\.75/u);
  assert.match(result.preset.costNotice, /预览和安装不调用付费接口/u);
});

test('search preset fails honestly when chosen runtime has no search entry', () => {
  const rootDir = path.resolve('/fixture/project');
  const result = searchMcpPreset({ rootDir, env: { HOME: '/fixture/home' }, exists: file => file === path.join(rootDir, 'scripts/aios.mjs') });
  assert.equal(result.ok, false);
  assert.match(result.error, /没有安装/);
});
