// scripts/check-doc-citations.mjs — 文档源码引用机械校验（v3 段 A1）
// 扫 docs/plans/*.md、docs/reports/*.md，提取 `<path>:<line>` 形式引用，核对：
// ① 文件存在（裸文件名按 git ls-files 唯一性解析）② 后缀歧义即报错
// ③ 行号 ≤ 文件行数 ④ 行号 > 0。不校验语义相符（仍需人）。
// 用法：node scripts/check-doc-citations.mjs [--root <repo>] [file ...]
// 退出码：引用全有效 → 0；任一失效 → 1。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CITATION_RE = /`([^`\s]*?):(\d+)(?:-(\d+))?`/gu;

function looksLikePath(prefix) {
  const text = String(prefix || '');
  return text.includes('.') || text.includes('/');
}

/**
 * 从 Markdown 文本提取引用 { ref, file, start, end, index }。
 * file = 冒号前的路径部分；start/end 为行号（无范围时 end=start）。
 */
export function extractCitations(text) {
  const out = [];
  CITATION_RE.lastIndex = 0;
  let match;
  while ((match = CITATION_RE.exec(String(text || ''))) !== null) {
    const [, file, startRaw, endRaw] = match;
    if (!looksLikePath(file)) continue;
    const start = Number.parseInt(startRaw, 10);
    const end = endRaw === undefined ? start : Number.parseInt(endRaw, 10);
    out.push({ ref: match[0], file, start, end, index: match.index });
  }
  return out;
}

export function listTrackedFiles(rootDir) {
  const stdout = execFileSync('git', ['ls-files'], { windowsHide: true, cwd: rootDir, encoding: 'utf8' });
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/**
 * 引用路径 → 仓库内真实文件（相对 root 的 posix 路径）。
 * 含 '/' 的按相对路径直接解析；裸文件名在 git ls-files 里必须唯一命中，
 * 0 命中 → missing，多命中 → ambiguous（必须写全路径）。
 */
export function resolveCitationFile(prefix, { rootDir, trackedFiles }) {
  const raw = String(prefix || '');
  // `./` 或 `/` 开头 = 锚定仓库根目录的完整路径，不做后缀搜索。
  // 这是消解根文件歧义（CLAUDE.md、AGENTS.md、.gitignore）的唯一写法。
  const anchored = raw.startsWith('./') || raw.startsWith('/');
  const clean = raw.replace(/^\.\//u, '').replace(/^\//u, '');
  if (anchored) {
    const abs = path.resolve(rootDir, clean);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { status: 'ok', rel: clean };
    }
    return { status: 'missing', reason: `no such file: ${clean}` };
  }
  if (clean.includes('/')) {
    const abs = path.resolve(rootDir, clean);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { status: 'ok', rel: clean };
    }
    // 组件内相对路径（如 packets/compact-packet.mjs）按后缀唯一匹配，
    // 与裸文件名同规则：唯一命中即接受，多命中必须写全路径。
    const hits = trackedFiles.filter((entry) => entry === clean || entry.endsWith(`/${clean}`));
    if (hits.length === 1) return { status: 'ok', rel: hits[0] };
    if (hits.length === 0) return { status: 'missing', reason: `no such file: ${clean}` };
    return { status: 'ambiguous', reason: `path ${clean} matches ${hits.length} files: ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? '…' : ''} — write the full path` };
  }
  const hits = trackedFiles.filter((entry) => entry === clean || entry.endsWith(`/${clean}`));
  if (hits.length === 1) return { status: 'ok', rel: hits[0] };
  if (hits.length === 0) return { status: 'missing', reason: `no tracked file named ${clean}` };
  return { status: 'ambiguous', reason: `basename ${clean} matches ${hits.length} files: ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? '…' : ''} — write the full path` };
}

export function countLines(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  if (!raw) return 0;
  const parts = raw.split('\n');
  return parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * 校验单条引用。返回 null = 有效；否则返回失效原因字符串。
 */
export function checkCitation(citation, { rootDir, trackedFiles }) {
  const { start, end } = citation;
  if (!Number.isFinite(start) || start < 1) {
    return `line ${start} is not > 0`;
  }
  if (!Number.isFinite(end) || end < start) {
    return `range end ${end} is before start ${start}`;
  }
  const resolved = resolveCitationFile(citation.file, { rootDir, trackedFiles });
  if (resolved.status !== 'ok') return resolved.reason;
  const total = countLines(path.resolve(rootDir, resolved.rel));
  if (end > total) {
    return `${citation.file}:${start}${end === start ? '' : `-${end}`} exceeds ${resolved.rel} (${total} lines)`;
  }
  return null;
}

export function collectDocFiles(rootDir) {
  const out = [];
  for (const dir of ['docs/plans', 'docs/reports']) {
    const abs = path.join(rootDir, dir);
    let entries = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) out.push(path.join(abs, entry.name));
    }
  }
  return out.sort();
}

export function checkFiles(absFiles, { rootDir, trackedFiles }) {
  const failures = [];
  let checked = 0;
  for (const abs of absFiles) {
    const text = fs.readFileSync(abs, 'utf8');
    const citations = extractCitations(text);
    checked += citations.length;
    for (const citation of citations) {
      const reason = checkCitation(citation, { rootDir, trackedFiles });
      if (reason) {
        failures.push({
          doc: path.relative(rootDir, abs),
          ref: citation.ref,
          reason,
        });
      }
    }
  }
  return { checked, files: absFiles.length, failures };
}

function parseArgs(argv) {
  const args = { root: null, files: [], changed: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) {
      args.root = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--changed') {
      args.changed = true;
    } else {
      args.files.push(argv[i]);
    }
  }
  return args;
}

/**
 * Release 门禁 scope：只查 working tree 里新增/修改的 plans/reports 文档。
 * 存量失效多为历史包袱（含外部竞品引用），全量红灯会让门禁永久失效；
 * 门禁的真实意图是「不再新增坏引用」，故只对本次改动负责。
 */
export function collectChangedDocFiles(rootDir) {
  const stdout = execFileSync('git', ['status', '--short', '--', 'docs/plans', 'docs/reports'], {
    windowsHide: true,
    cwd: rootDir, encoding: 'utf8',
  });
  const out = [];
  for (const line of stdout.split('\n')) {
    const file = line.slice(3).trim().replace(/"/gu, '');
    if (!file.endsWith('.md')) continue;
    const abs = path.resolve(rootDir, file);
    try {
      if (fs.statSync(abs).isFile()) out.push(abs);
    } catch {
      continue;
    }
  }
  return out.sort();
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(args.root || path.join(scriptDir, '..'));
  if (args.changed && args.files.length === 0) {
    const changedOnly = collectChangedDocFiles(rootDir);
    if (changedOnly.length === 0) {
      console.log('[citations] no changed docs/plans or docs/reports files; gate passes');
      process.exit(0);
    }
    args.files.push(...changedOnly);
  }
  const absFiles = args.files.length > 0
    ? args.files.map((file) => path.resolve(file))
    : collectDocFiles(rootDir);
  let trackedFiles = [];
  try {
    trackedFiles = listTrackedFiles(rootDir);
  } catch (error) {
    console.error(`[citations] git ls-files failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const { checked, files, failures } = checkFiles(absFiles, { rootDir, trackedFiles });
  const byReason = { missing: 0, ambiguous: 0, range: 0 };
  for (const failure of failures) {
    if (/matches \d+ files/u.test(failure.reason)) byReason.ambiguous += 1;
    else if (/no (such|tracked)/u.test(failure.reason)) byReason.missing += 1;
    else byReason.range += 1;
    console.log(`${failure.doc}: ${failure.ref} → ${failure.reason}`);
  }
  console.log(`[citations] ${checked} refs in ${files} files: ${failures.length} invalid (missing=${byReason.missing} ambiguous=${byReason.ambiguous} range=${byReason.range})`);
  process.exit(failures.length > 0 ? 1 : 0);
}
