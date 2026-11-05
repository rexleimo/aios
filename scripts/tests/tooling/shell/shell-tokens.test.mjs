import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerCss = new URL('../../../../docs-site/assets/redesign/tokens.css', import.meta.url);
const shellCss = new URL('../../../../apps/shell/ui/src/app/globals.css', import.meta.url);

// Tailwind 4 的 @theme 用自己的命名空间生成 utility；这里把它映射回所有者的 token 名。
// 三条映射规则，不是逐个列举：新增一个 utility token 时不需要改本测试。
const NAMESPACE_TO_OWNER = [
  ['--color-rex-', '--rex-'],
  ['--font-rex-', '--rex-font-'],
  ['--radius-rex-', '--rex-radius-'],
];

function toOwnerName(name) {
  const found = NAMESPACE_TO_OWNER.find(([prefix]) => name.startsWith(prefix));
  assert.ok(found, `${name} 不在已知的 Tailwind 命名空间里`);
  return found[1] + name.slice(found[0].length);
}

function declarationsOf(text, block) {
  const pattern = block === 'theme'
    ? /@theme\s*\{([\s\S]*?)\}/u
    : /:root\[data-rex-theme="dark"\]\s*\{([\s\S]*?)\}/u;
  const body = text.match(pattern)?.[1] ?? '';
  const ownerPattern = block === 'theme'
    ? /^:root[^{]*\{([\s\S]*?)\}/mu
    : /:root\[data-rex-theme="dark"\]\s*\{([\s\S]*?)\}/u;
  const map = new Map();
  for (const line of body.split('\n')) {
    const found = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?);/u);
    if (found) map.set(found[1], found[2].trim());
  }
  return { map, ownerPattern };
}

function ownerDeclarations(text, pattern) {
  const body = text.match(pattern)?.[1] ?? '';
  const map = new Map();
  for (const line of body.split('\n')) {
    const found = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?);/u);
    if (found) map.set(found[1], found[2].trim());
  }
  return map;
}

test('every Tailwind token the shell declares matches the owner file value', () => {
  const owner = readFileSync(ownerCss, 'utf8');
  const { map: theme, ownerPattern } = declarationsOf(readFileSync(shellCss, 'utf8'), 'theme');
  const ownerLight = ownerDeclarations(owner, ownerPattern);
  assert.ok(theme.size > 0, 'the shell must declare the tokens it consumes');
  for (const [name, value] of theme) {
    const ownerName = toOwnerName(name);
    assert.ok(ownerLight.has(ownerName), `${name} -> ${ownerName} 不是所有者文件里的真 token`);
    assert.equal(value, ownerLight.get(ownerName), `${ownerName} 与所有者值不一致`);
  }
});

test('the shell dark override only touches tokens the owner dark block defines', () => {
  const owner = readFileSync(ownerCss, 'utf8');
  const { map: dark, ownerPattern } = declarationsOf(readFileSync(shellCss, 'utf8'), 'dark');
  const ownerDark = ownerDeclarations(owner, ownerPattern);
  assert.ok(dark.size > 0);
  for (const [name, value] of dark) {
    const ownerName = toOwnerName(name);
    assert.ok(ownerDark.has(ownerName), `${ownerName} has no dark value in the owner file`);
    assert.equal(value, ownerDark.get(ownerName), `${ownerName} dark value drifted`);
  }
});

test('the shell styles with utilities, not with a second handwritten CSS layer', () => {
  const css = readFileSync(shellCss, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@import "tailwindcss"/u);
  // 允许的选择器只有两个：深色主题的变量覆写，和 body 的默认字体/颜色。
  // 其余一律在组件里用 utility 组合——这条把「不再长出第二个 CSS 层」变成可判定的事实。
  const selectors = [...css.matchAll(/^([^\s@{}][^{\n]*)\{/gmu)].map((m) => m[1].trim());
  assert.deepEqual(selectors, [':root[data-rex-theme="dark"]', 'body']);
});

test('the accessibility baseline survives the Tailwind switch', () => {
  const css = readFileSync(shellCss, 'utf8');
  const table = readFileSync(new URL('../../../../apps/shell/ui/src/components/matrix-table.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../../../apps/shell/ui/src/app/page.tsx', import.meta.url), 'utf8');
  // 无头库提供焦点与键盘行为，界面侧必须显式保留可见焦点环。
  assert.match(table, /focus-visible:outline/u);
  assert.match(css, /--color-rex-text-muted/u);
  assert.match(css, /--color-rex-text-body/u);
  // 动效约束：用了 transition-/animate- 就必须有 motion-reduce: 对应项（DESIGN.md 的 Accessibility Baseline）。
  for (const source of [table, page]) {
    for (const className of source.match(/className="([^"]*)"/gu) ?? []) {
      if (/\b(transition-|animate-)/u.test(className) && !/motion-reduce:/u.test(className)) {
        assert.fail(`用了动效却没有 prefers-reduced-motion 对应项：${className}`);
      }
    }
  }
});