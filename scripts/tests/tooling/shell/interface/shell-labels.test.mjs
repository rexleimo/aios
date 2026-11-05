import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CAPABILITY_AXES } from '../../../../client-capability-scorecard.mjs';

const ui = (file) => new URL(`../../../../../apps/shell/ui/${file}`, import.meta.url);
const shell = (file) => new URL(`../../../../../apps/shell/${file}`, import.meta.url);

// labels.ts 是 TS，测试里不引运行时（本仓无 ts 运行器），只按文本核对声明。
// 判据是客观事实：键存在、值不等于键本身、值非空。
function labelBlock(source, name) {
  const body = source.match(new RegExp(`${name}: Record<string, string> = \\{([\\s\\S]*?)\\};`, 'u'))?.[1] ?? '';
  const map = new Map();
  for (const line of body.split('\n')) {
    const found = line.match(/^\s*'?([\w-]+)'?\s*:\s*'([^']*)',?/u);
    if (found) map.set(found[1], found[2]);
  }
  return map;
}

test('every axis the scorecard owns has a display label', () => {
  // 轴词表的所有者是 scorecard；labels 缺一项就会在界面上静默退化成英文原文。
  const labels = labelBlock(readFileSync(ui('src/lib/labels.ts'), 'utf8'), 'AXIS_LABEL');
  assert.deepEqual([...labels.keys()], [...CAPABILITY_AXES], 'labels 的键序必须与轴词表一致');
  for (const axis of CAPABILITY_AXES) {
    const label = labels.get(axis);
    assert.ok(label, `${axis} 没有中文名`);
    assert.notEqual(label, axis, `${axis} 的标签就是标识本身，等于没翻译`);
  }
});

test('every evidence label the capability layer can produce is displayed', () => {
  const labels = labelBlock(readFileSync(ui('src/lib/labels.ts'), 'utf8'), 'EVIDENCE_LABEL');
  const matrix = readFileSync(shell('data/matrix.mjs'), 'utf8');
  for (const label of ['pending-smoke', 'compatibility-only', 'evidence-blocked', 'not-covered']) {
    assert.match(matrix, new RegExp(label, 'u'), `能力层会产出 ${label}`);
    assert.ok(labels.get(label), `${label} 没有展示名`);
  }
});

test('a server component must not read data out of a "use client" module', () => {
  // 实测教训：page.tsx 从 'use client' 的 matrix-table 里 import 常量时，
  // 服务端拿到的是客户端引用代理，轴名退化成英文、证据列表渲染成空串。
  const page = readFileSync(ui('src/app/page.tsx'), 'utf8');
  const table = readFileSync(ui('src/components/matrix-table.tsx'), 'utf8');
  assert.match(table, /^'use client';/u);
  assert.match(page, /from '\.\.\/lib\/labels'/u);
  assert.match(page, /import \{ MatrixTable \} from '\.\.\/components\/matrix-table'/u);
  // 服务端组件里除组件本身外，不得再从 components/ 取任何东西。
  const fromComponents = [...page.matchAll(/import\s+\{([^}]*)\}\s+from\s+'([^']*components\/[^']*)'/gu)]
    .flatMap((m) => m[1].split(',').map((name) => name.trim()))
    .filter((name) => name !== 'MatrixTable');
  assert.deepEqual(fromComponents, [], 'page.tsx 只能从组件模块 import 组件本身');
});