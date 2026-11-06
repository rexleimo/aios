// TUI 模块图的相对引用必须**大小写精确**地解析到真实文件。
//
// 为什么需要这条用例（2026-11-06 用户实测崩溃）：`aios`（交互入口）直接抛
//   SyntaxError: The requested module '../App' does not provide an export named 'App'
// 因为 `tui-ink/app/index.tsx` 与 `app/cli.tsx` 里写的是 `from '../App'`——
// 在大小写不敏感的文件系统（Windows/macOS）上，`../App` 指的是**自己所在的目录**（`app/`），
// 于是模块自己 import 自己：没有 `App` 导出，报错；在大小写敏感的文件系统上它干脆不存在。
// 真正的目标是同目录的 `App.tsx`（`export function App`）。
//
// 为什么既有门没抓住它：
//   · `tsx` 用 esbuild 转译、不做类型检查，所以模块解析错误只在运行时炸；
//   · `test-suite-wiring` 只统计 `scripts/tests/**` 下的测试文件，`lib/**/tests/*.ts` 不在它的视野；
//   · Windows 上 `existsSync('../App')` 会返回 true（命中的是目录），所以「文件存在」也不够，
//     必须比较**目录项里的原始大小写**。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const TUI_DIR = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'lib', 'execution', 'tui-ink');
const APP_DIR = path.join(TUI_DIR, 'app');
const EXTENSIONS = ['', '.tsx', '.ts', '.mjs', '.js', '/index.tsx', '/index.ts', '/index.mjs'];

const ROOT = path.resolve(TUI_DIR, '..', '..', '..', '..');

/**
 * 从仓库根逐段走一遍，要求每一段的名字大小写**完全一致**。
 * 只比对最后一段不够：Windows 上 `readdirSync('tui-ink/App')` 会成功并返回 `app/` 的内容，
 * 于是 `../App` 这种「大小写不同的目录名」会被误判成可解析——这正是本次崩溃的形状。
 */
function caseExactTarget(absTarget) {
  const rel = path.relative(ROOT, absTarget);
  if (rel.startsWith('..')) return '';
  let cursor = ROOT;
  for (const segment of rel.split(path.sep)) {
    let entries = [];
    try {
      entries = fs.readdirSync(cursor);
    } catch {
      return '';
    }
    if (!entries.includes(segment)) return '';
    cursor = path.join(cursor, segment);
  }
  return cursor;
}

/** 候选扩展名逐个尝试，且要求整条路径大小写精确。 */
function resolveCaseExact(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) {
    const candidate = caseExactTarget(`${base}${ext}`);
    if (candidate) return candidate;
  }
  return '';
}

/** 收集一个源文件里的相对说明符（静态 import / export-from / 动态 import 三种写法）。 */
function relativeSpecifiers(source) {
  const found = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gu,
    /(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/gu,
    /import\(\s*['"](\.[^'"]+)['"]\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function sourceFiles() {
  const files = [];
  for (const name of fs.readdirSync(TUI_DIR, { withFileTypes: true })) {
    if (name.isFile() && /\.(tsx|ts|mjs)$/u.test(name.name)) files.push(path.join(TUI_DIR, name.name));
  }
  for (const name of fs.readdirSync(APP_DIR, { withFileTypes: true })) {
    if (name.isFile() && /\.(tsx|ts|mjs)$/u.test(name.name)) files.push(path.join(APP_DIR, name.name));
  }
  return files;
}

test('TUI 入口与 app/ 下的相对 import 都能大小写精确地解析到真实文件', () => {
  const broken = [];
  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of relativeSpecifiers(source)) {
      if (!resolveCaseExact(specifier, file)) {
        broken.push(`${path.relative(TUI_DIR, file)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(broken, [], `这些相对 import 在大小写敏感的文件系统上会 MODULE_NOT_FOUND，在 Windows 上会解析到错误的目录：\n${broken.join('\n')}`);
});

test('TUI 的 App 组件由同目录 App.tsx 导出，且入口不再用大小写不敏感的歧义路径', () => {
  const appSource = fs.readFileSync(path.join(APP_DIR, 'App.tsx'), 'utf8');
  assert.match(appSource, /export function App\b/u, 'App.tsx 必须导出 App（入口按命名导入使用）');

  for (const name of ['index.tsx', 'cli.tsx']) {
    const source = fs.readFileSync(path.join(APP_DIR, name), 'utf8');
    assert.doesNotMatch(source, /from '\.\.\/App'/u, `${name} 用了 '../App'：在 Windows 上会解析回 app/ 自己（自引用），在 Linux 上不存在`);
    assert.match(source, /from '\.\/App'/u, `${name} 应当从同目录的 './App' 命名导入`);
  }
});