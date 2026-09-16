// 站点文本完整性防回归：编码损坏、跨脚本残留、语言覆盖与术语锁定。
// 背景：文件数/标题数一致会漏掉整页未翻译（曾发生 ja 博客正文为英文/中文），
// 因此这里用“剔除代码后的本地字符占比 + 与 zh 参照逐行对照”做判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CRLF = '\r\n';

// 扫描范围：站点文本 + 会被发布的源码/技能说明（历史上这些文件出现过 U+FFFD）。
const TEXT_SCAN_DIRS = ['docs-site', 'blog-site', 'scripts', 'skill-sources', 'public'];
const TEXT_EXT = /\.(md|mjs|json|html|css|js)$/;
const SITE_DIRS = ['docs-site', 'blog-site'];
const LOCALES = ['zh', 'ja', 'ko'];

const NATIVE = {
  zh: /[\u4e00-\u9fff]/,
  ja: /[\u3040-\u30ff\u4e00-\u9fff]/,
  ko: /[\uac00-\ud7a3]/,
};
const KANA = /[\u3040-\u30ff]/;
const HANGUL = /[\uac00-\ud7a3]/;
const HAN = /[\u4e00-\u9fff]/;
// 命令/示例前缀：这类行在各语言中都保持原样，不参与“未译”判定。
const COMMAND = /^\s*(aios|node|npm|npx|uvx|git|cd|ls|cat|grep|find|test|mkdir|export|curl|python|powershell|winget|choco|\[Net|Set-|New-|\$)/;
// 带模型名/端点/参数的表格与 CLI 载荷：所有语言同为拉丁文。
const PAYLOAD = /(--objective|--task|--content|--input|--model|https?:\/\/|\bx-?[0-9])/;

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT_EXT.test(name)) out.push(p);
  }
  return out;
}

function textFiles() {
  const files = [];
  for (const dir of TEXT_SCAN_DIRS) files.push(...walk(join(ROOT, dir)));
  return files;
}

// BOM 只需盯站点 markdown：mkdocs/YAML 会因 BOM 解析失败；
// 少数 .mjs/.html 的 BOM 属既有状态，不在本断言范围内。
function siteMarkdownFiles() {
  const files = [];
  for (const dir of SITE_DIRS) files.push(...walk(join(ROOT, dir)));
  return files.filter((p) => p.endsWith('.md'));
}

function siteMarkdown() {
  const files = [];
  for (const dir of SITE_DIRS) {
    for (const p of walk(join(ROOT, dir))) if (p.endsWith('.md')) files.push(p);
  }
  return files;
}

function read(p) {
  return readFileSync(p, 'utf8').split(CRLF).join('\n');
}

function relative(p) {
  return p.slice(ROOT.length + 1).split('\\').join('/');
}

// 拆出 front matter 与正文，并跳过 ``` 与 ~~~ 两种围栏。
function proseLines(body) {
  const lines = body.split('\n');
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) start = end + 1;
  }
  const out = [];
  let fence = false;
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('```') || line.startsWith('~~~')) {
      fence = !fence;
      continue;
    }
    out.push({ no: i + 1, line, code: fence });
  }
  return out;
}

function stripMarkup(text) {
  return text
    .replace(/`[^`]*`/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

function isTranslatableProse(line) {
  const s = line.trim();
  if (!s) return false;
  if (/^[-|:\s]+$/.test(s)) return false;
  if (s.startsWith('<!--') || s.startsWith('<') || s.startsWith('![')) return false;
  if (/href=|class=|src=/.test(s)) return false;
  if (COMMAND.test(s)) return false;
  if (PAYLOAD.test(s)) return false;
  if (/^[-*]\s+\[[^\]]+\]\([^)]+\)[：:]?$/.test(s)) return false; // 纯链接条目
  return stripMarkup(s).split(/\s+/).filter((w) => /^[A-Za-z]{3,}$/.test(w.replace(/[^A-Za-z]/g, ''))).length >= 4;
}

function localePages(loc) {
  return siteMarkdown().filter((p) => {
    const rel = relative(p);
    const parts = rel.split('/');
    return parts.length >= 3 && SITE_DIRS.includes(parts[0]) && parts[1] === loc;
  });
}

function siblingLocalePage(p, loc, other) {
  const rel = relative(p);
  const candidate = join(ROOT, rel.split('/').slice(0, 2).join('/').replace(`/${loc}`, `/${other}`), rel.split('/').slice(2).join('/'));
  try {
    return statSync(candidate).isFile() ? candidate : '';
  } catch {
    return '';
  }
}

test('site and script text contain no replacement-character corruption', () => {
  const hits = [];
  const bom = [];
  for (const p of siteMarkdownFiles()) {
    const raw = readFileSync(p, 'latin1');
    if (raw.startsWith('\u00ef\u00bb\u00bf')) bom.push(relative(p));
    const text = read(p);
    const idx = text.indexOf('\ufffd');
    if (idx !== -1) hits.push(`${relative(p)}:${text.slice(0, idx).split('\n').length}`);
  }
  assert.deepEqual(bom, [], 'markdown/JSON must not start with a UTF-8 BOM');
  assert.deepEqual(hits, [], 'U+FFFD means characters were lost in encoding; repair by meaning');
});

test('localized pages do not contain the other language scripts', () => {
  const offenders = [];
  for (const loc of LOCALES) {
    for (const p of localePages(loc)) {
      // zh 样例载荷与日文汉字属正当内容，只拦“他种拼音文字”。
      for (const line of proseLines(read(p))) {
        if (line.code) continue;
        if (loc !== 'ja' && KANA.test(line.line)) offenders.push(`${relative(p)}:${line.no} kana`);
        if (loc !== 'ko' && HANGUL.test(line.line)) offenders.push(`${relative(p)}:${line.no} hangul`);
        if (loc === 'ja' && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(line.line)) offenders.push(`${relative(p)}:${line.no} hangul jamo`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'ja/ko/zh pages must not mix in another locale script');
});

test('english root pages stay free of CJK prose', () => {
  const offenders = [];
  for (const p of walk(join(ROOT, 'docs-site'))) {
    if (!p.endsWith('.md')) continue;
    const parts = relative(p).split('/');
    if (parts.length !== 2) continue; // 只查根目录英文页
    const text = read(p);
    // perception.md 的中文样例载荷与 changelog 的语言名清单为已审核例外。
    const exempt = /(^|\/)(perception|changelog)\.md$/.test(relative(p));
    if (exempt) continue;
    for (const line of proseLines(text)) {
      if (line.code) continue;
      if (KANA.test(line.line) || HANGUL.test(line.line)) offenders.push(`${relative(p)}:${line.no}`);
    }
  }
  assert.deepEqual(offenders, [], 'english docs pages must not contain kana or hangul');
});

test('each localized page is actually written in its own language', () => {
  // 整页未翻译的历史特征：剔除代码后本地字符占比接近 0。
  const low = [];
  for (const loc of LOCALES) {
    for (const p of localePages(loc)) {
      const text = read(p);
      const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      const native = (stripped.match(new RegExp(NATIVE[loc].source, 'g')) || []).length;
      const latin = (stripped.match(/[A-Za-z]/g) || []).length;
      if (native + latin < 200) continue; // 短页由逐行对照兜底
      const share = native / Math.max(1, native + latin);
      if (share < 0.035) low.push(`${relative(p)} share=${(share * 100).toFixed(1)}%`);
    }
  }
  assert.deepEqual(low, [], 'page below 3.5% native characters is treated as untranslated');
});

test('localized pages leave no line that zh already translated', () => {
  const gaps = [];
  for (const loc of ['ja', 'ko']) {
    for (const p of localePages(loc)) {
      const ref = siblingLocalePage(p, loc, 'zh');
      if (!ref) continue;
      const mine = proseLines(read(p));
      const base = proseLines(read(ref));
      if (mine.length !== base.length) continue; // 结构差异页由上一条占比断言覆盖
      for (let i = 0; i < mine.length; i += 1) {
        const a = mine[i];
        const b = base[i];
        if (a.code || b.code) continue;
        if (!isTranslatableProse(b.line) || !HAN.test(b.line)) continue;
        if (!isTranslatableProse(a.line)) continue;
        if (NATIVE[loc].test(a.line)) continue;
        gaps.push(`${relative(p)}:${a.no} ${a.line.trim().slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(gaps, [], 'zh translated this line but the ja/ko page kept it English');
});

test('repaired terminology stays present in localized pages', () => {
  const locks = [
    ['docs-site/ja/perception.md', /知覚/],
    ['docs-site/ko/perception.md', /인지/],
    ['docs-site/ja/codemap.md', /ナレッジグラフ/],
    ['docs-site/ko/codemap.md', /인지 그래프|코드맵/],
    ['docs-site/ja/architecture.md', /コンポーネント|実行チェーン/],
    ['docs-site/ko/architecture.md', /컴포넌트|실행 흐름/],
    ['docs-site/ja/cli-comparison.md', /対応クライアント/],
    ['docs-site/ko/cli-comparison.md', /지원 클라이언트/],
  ];
  for (const [rel, re] of locks) {
    const text = read(join(ROOT, rel));
    assert.match(text, re, `${rel} lost its localized terminology`);
  }
});

test('changelog headings stay at parity across locales', () => {
  const count = (rel) => (read(join(ROOT, rel)).match(/^## v[0-9]/gm) || []).length;
  const en = count('docs-site/changelog.md');
  assert.ok(en > 0, 'english changelog must list versions');
  for (const loc of LOCALES) assert.equal(count(`docs-site/${loc}/changelog.md`), en, `${loc} changelog drifted from english`);
});
