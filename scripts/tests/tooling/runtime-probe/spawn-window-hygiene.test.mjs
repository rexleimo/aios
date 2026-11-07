import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/* 中文注释：这条门禁钉的是一个**用户可见**的事实，不是风格偏好：Windows 上父进程没有控制台时
   （GUI 客户端 / Tauri 桌面壳 / detached 钩子 / 无窗口 MCP 宿主），child_process 不传
   windowsHide 就会给子进程新建一个可见控制台窗口。命令一结束窗口销毁，用户看到的就是
   「执行某些 MCP 服务时一直在闪小黑窗」。实测对照（本机，2026-11-07）：
     - 空闲 7s：可见控制台窗口 0
     - 无 windowsHide + 无控制台父进程：可见 CASCADIA/ConsoleWindowClass 窗口出现并存活约 2s
     - windowsHide: true：0
   所以规则是：本仓运行时代码里的每一个子进程启动点，都必须看得见 windowsHide。 */

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const SCAN_ROOTS = ['scripts', 'packages', 'mcp-server/src', 'apps/shell'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'tests', '__tests__', 'test', 'coverage', '.turbo', 'target', '.git']);
const SKIP_FILE = /\.(test|spec)\.(mjs|js|ts|cjs)$/;
const SOURCE_FILE = /\.(mjs|js|ts|cjs)$/;
const CALL_RE = /(?<![.\w])(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)(Impl)?\s*\(/;
const COMMENT_RE = /^\s*(\/\/|\*|\/\*)/;

/* 中文注释：14 行窗口覆盖「一行调用 + 多行 options 字面量」；更远的对象不属于这次启动。 */
const OPTIONS_WINDOW_LINES = 14;
/* 中文注释：一个文件里数得出至少这么多个启动点，门禁才不是「什么也没扫到」的假绿。
   实测 2026-11-07：修复后仍有 70+ 个真实启动点（README 脚本、CLI、MCP 服务器、Console 后端）。 */
const MIN_SCANNED_SITES = 60;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
      continue;
    }
    if (SOURCE_FILE.test(entry.name) && !SKIP_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

function sourceFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const full = path.join(rootDir, root);
    if (fs.existsSync(full)) walk(full, files);
  }
  return files;
}

/* 中文注释：options 通过变量传入时（opts / options / spawnOptions），字面量不在调用行上。
   这里按同文件定义回看初始化式，避免把「已隐藏、只是抽了变量」判成违规；也避免给这些调用开豁免口子。
   未在此覆盖的形态（跨文件助手、动态拼装）会直接报红——那时把字面量搬到调用点即可。 */
function optionsVariableHidesFlag(lines, identifier) {
  const pattern = new RegExp(`(?:const|let|var)\\s+${identifier}\\s*=`);
  for (let i = 0; i < lines.length; i += 1) {
    if (!pattern.test(lines[i])) continue;
    /* 初始化式可能是三元/调用，所以不要求紧跟 `{`：回看整段初始化式即可。 */
    if (lines.slice(i, i + OPTIONS_WINDOW_LINES).join('\n').includes('windowsHide')) return true;
  }
  return false;
}

function relativeKey(file) {
  return path.relative(rootDir, file).split(path.sep).join('/');
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('child_process') && !source.includes('getCommandSpawnSpec')) return { sites: 0, violations: [] };
  const lines = source.split(/\r?\n/u);
  const violations = [];
  let sites = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!CALL_RE.test(line)) continue;
    if (line.includes('child_process')) continue;
    if (COMMENT_RE.test(line)) continue;
    sites += 1;
    if (lines.slice(i, i + OPTIONS_WINDOW_LINES).join('\n').includes('windowsHide')) continue;
    const identifiers = [...line.matchAll(/[A-Za-z_$][\w$]*/gu)].map((match) => match[0]);
    if (identifiers.some((identifier) => optionsVariableHidesFlag(lines, identifier))) continue;
    violations.push(`${relativeKey(file)}:${i + 1}  ${line.trim()}`);
  }
  return { sites, violations };
}

function scanRepository() {
  const perFile = new Map();
  const violations = [];
  let scanned = 0;
  for (const file of sourceFiles()) {
    const result = scanFile(file);
    if (result.sites > 0) perFile.set(relativeKey(file), result.sites);
    scanned += result.sites;
    violations.push(...result.violations);
  }
  return { perFile, scanned, violations };
}

const report = scanRepository();

test('the scan sees the launches it is supposed to judge', () => {
  assert.ok(
    report.scanned >= MIN_SCANNED_SITES,
    `expected at least ${MIN_SCANNED_SITES} child-process launch sites, saw ${report.scanned}; a green scan that matched nothing proves nothing`,
  );
});

test('every child-process launch hides its window', () => {
  assert.deepEqual(
    report.violations,
    [],
    `child-process launches must pass windowsHide: true, otherwise a console-less host pops a visible window:\n${report.violations.join('\n')}`,
  );
});

test('the process owner itself is covered by the gate (positive control)', () => {
  const owner = 'scripts/lib/foundation/platform/process/spawn.mjs';
  assert.ok((report.perFile.get(owner) ?? 0) >= 3, `${owner} should expose at least three judged launch sites`);
  assert.equal(report.violations.some((line) => line.startsWith(owner)), false);
});

test('every declared scan root contributes judged launch sites', () => {
  /* 中文注释：某个根静默退出扫描时，声明会看着完整而门禁什么也没管。这里逐个根要证据。 */
  for (const root of SCAN_ROOTS) {
    const contributes = [...report.perFile.keys()].some((file) => file.startsWith(`${root}/`));
    assert.equal(contributes, true, `scan root ${root} contributed no judged launch site`);
  }
});
