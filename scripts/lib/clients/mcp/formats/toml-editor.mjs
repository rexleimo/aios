// scripts/lib/clients/mcp/formats/toml-editor.mjs — TOML 落点（codex / grok 的 `[mcp_servers.*]`）的文本级增删。
//
// 为什么不用 codemap 的 `upsertCodexMcpToml`：它把条目名写死成 `CRG_MCP_ALIAS`，删除时还会
// 顺手把连续空行压成两个、把整个文件尾部的空白重写（`codemap/targets/mcp-targets/toml.mjs:108-123`）——
// 那是「卸掉我装的东西」顺带改了别人的排版。本模块只做两件事：末尾追加一个表段，
// 或精确抹掉那一段（含我们自己加在它前面的那一个空行），其余字节原样。
//
// 子表处理：`[mcp_servers.<name>.env]` 属于该条目的一部分，删除时必须一起带走，
// 否则会留下没人认领的孤儿表（实测 codex 配置里存在 `.env` 子表）。
const BARE_KEY = /^[A-Za-z0-9_-]+$/u;

/** 纯函数：转义 TOML 字符串，避免 Windows 反斜杠和引号破坏配置。 */
export function escapeTomlString(value) {
  return String(value ?? '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function formatKey(key) {
  return BARE_KEY.test(key) ? key : `"${escapeTomlString(key)}"`;
}

/** 值 → TOML 文本。对象写成内联表，避免为 `env` 另开一个表段。 */
export function formatTomlValue(value) {
  if (typeof value === 'string') return `"${escapeTomlString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatTomlValue).join(', ')}]`;
  if (value && typeof value === 'object') {
    const parts = Object.keys(value).map((key) => `${formatKey(key)} = ${formatTomlValue(value[key])}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  return '""';
}

function unquoteString(text) {
  return text.slice(1, -1).replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
}

/** 顶层逗号切分：字符串与嵌套括号内的逗号不算分隔。 */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      current += ch;
      if (ch === '\\') { current += text[i + 1] || ''; i += 1; }
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; current += ch; continue; }
    if (ch === '[' || ch === '{') depth += 1;
    if (ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export function parseTomlValue(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('"')) return unquoteString(trimmed);
  if (trimmed.startsWith('[')) return splitTopLevel(trimmed.slice(1, -1)).map((item) => parseTomlValue(item));
  if (trimmed.startsWith('{')) {
    const body = {};
    for (const part of splitTopLevel(trimmed.slice(1, -1))) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const key = part.slice(0, eq).trim().replace(/^"(.*)"$/u, '$1');
      body[key] = parseTomlValue(part.slice(eq + 1));
    }
    return body;
  }
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (/^-?\d+(\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function isHeader(line) {
  return /^\s*\[.+\]\s*$/u.test(line);
}

function splitLines(raw) {
  const hasCrlf = raw.includes('\r\n');
  const hasBareLf = raw.replace(/\r\n/gu, '').includes('\n');
  if (hasCrlf && hasBareLf) return { mixed: true, eol: '\n', lines: [] };
  return { mixed: false, eol: hasCrlf ? '\r\n' : '\n', lines: raw.split(/\r?\n/u) };
}

function headerFor(path, name) {
  const segments = [...path, name];
  return `[${segments.map((segment) => formatKey(segment)).join('.')}]`;
}

/** 定位一个表段：返回行下标区间 [start, end)；子表（`<header>.xxx`）算在本段内。 */
function locateSection(lines, header) {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!isHeader(lines[i])) continue;
    const trimmed = lines[i].trim();
    // 只有「本条目的子表」才继续属于本段；别人的段落结束本段。
    if (trimmed.startsWith(header.slice(0, -1) + '.')) continue;
    end = i;
    break;
  }
  return { start, end };
}

/**
 * 读取桶里的条目名 → 值对象。
 *
 * 一级子表（codex 的 `[mcp_servers.<name>.env]`）的键**并进父条目**：codex 现实配置就是这么写的，
 * 而 w2/w5a 的 reader 只认父段、把子表整段丢掉——于是同一份文件的 env 在「读回」时消失，
 * 上层会把它判成 `kept-differs` 并试图「修复」一份本来就对的配置。内联表与子表同时存在时按顺序合并
 * （子表覆盖内联），与 codemap/browser 旧写入器保存 env 的语义一致。
 * 更深的孙表不认：真出现就留给调用方判，不猜。
 */
export function readTomlEntries(raw, path) {
  const { lines } = splitLines(raw);
  const prefix = `[${path.map((segment) => formatKey(segment)).join('.')}.`;
  const entries = {};
  let current = null;
  let subKey = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (isHeader(trimmed)) {
      const inside = trimmed.startsWith(prefix) && trimmed.endsWith(']');
      const inner = inside ? trimmed.slice(prefix.length, -1) : '';
      const segments = inner ? inner.split('.').map((segment) => segment.replace(/^"(.*)"$/u, '$1')) : [];
      if (inside && segments.length === 1) {
        current = segments[0];
        subKey = null;
        if (!entries[current]) entries[current] = {};
        continue;
      }
      if (inside && segments.length === 2 && entries[segments[0]]) {
        current = segments[0];
        subKey = segments[1];
        if (entries[current][subKey] === undefined) entries[current][subKey] = {};
        continue;
      }
      // 别人的段、或更深的孙表：结束当前条目，不把内容并进任何条目。
      current = null;
      subKey = null;
      continue;
    }
    if (!current) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^"(.*)"$/u, '$1');
    const value = parseTomlValue(trimmed.slice(eq + 1));
    if (subKey) {
      const bucket = entries[current][subKey];
      if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) bucket[key] = value;
      continue;
    }
    const existing = entries[current][key];
    const bothObjects = existing && typeof existing === 'object' && !Array.isArray(existing)
      && value && typeof value === 'object' && !Array.isArray(value);
    entries[current][key] = bothObjects ? { ...existing, ...value } : value;
  }
  return Object.freeze({ found: Object.keys(entries).length > 0, entries });
}

/**
 * 表段的文本形状：标量与数组留在父段，**对象值写成一级子表**（codex 的 `[x.env]` 约定）。
 *
 * 为什么不是内联表：codex 现实配置与 codemap/browser 的旧写入器都用子表，浏览器 TOML 迁移的用例
 * 直接把「不得出现 `env = {`」钉成断言。把对象写成内联表不是「等价改写」，而是把用户的 env 换成另一种
 * 形状——收编（w5b）要的是只动托管条目，不是顺手改形状。
 * 更深的嵌套（子表里还有对象）直接拒：本层只承诺一级，猜下去会把结构写坏。
 */
function sectionLines(header, entry) {
  const lines = [header];
  const subTables = [];
  for (const [key, value] of Object.entries(entry)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      subTables.push([key, value]);
      continue;
    }
    lines.push(`${formatKey(key)} = ${formatTomlValue(value)}`);
  }
  for (const [key, value] of subTables) {
    const nested = Object.entries(value);
    if (nested.some(([, item]) => item && typeof item === 'object' && !Array.isArray(item))) {
      throw new Error('toml-nested-too-deep');
    }
    lines.push('', `[${header.slice(1, -1)}.${formatKey(key)}]`, ...nested.map(([k, v]) => `${formatKey(k)} = ${formatTomlValue(v)}`));
  }
  return lines;
}

/** 追加一个表段；已存在则由调用方判定 unchanged/conflict，这里不静默覆盖。 */
export function insertTomlEntry(raw, path, name, entry) {
  const { mixed, eol, lines } = splitLines(raw);
  if (mixed) throw new Error('mixed-newlines');
  const header = headerFor(path, name);
  const existing = locateSection(lines, header);
  if (existing) throw new Error('entry-exists');
  const body = sectionLines(header, entry);
  const next = [...lines];
  if (raw === '') {
    next.length = 0;
    next.push(...body, '');
    return { text: next.join(eol), replaced: false };
  }
  // 末尾追加：先去掉 split 留下的尾空元素，垫**一个**空行（与删除时带走的那一个成对），再写本段。
  while (next.length && next[next.length - 1] === '') next.pop();
  if (next.length) next.push('');
  next.push(...body, '');
  return { text: next.join(eol), replaced: false };
}

/**
 * 原地改写一个已存在的表段：节**留在它原来的行位置**，只换段内的键值行。
 * 为什么需要它：codemap 的 `doctor --fix` 是原地替换（`codemap/targets/mcp-targets/json.mjs` 的 upsert），
 * 而「先 remove 再 insert」会把本段搬到文件末尾（`insertTomlEntry` 只做末尾追加）——
 * 内容没丢，但条目的位置变了，别人的 `# 顺序注释` 与之相邻时会错位。收编（w5b）要有等价原语才有得谈。
 * 段不存在即抛 `entry-not-found`：替换不是插入的另一种写法，缺条目是调用方的判断错误，不静默补。
 * 子表（`[x.env]`）随本段一起重写：它的键由新条目里的 `env` 决定，留着旧的会读回一份没人认领的混合形状。
 */
export function replaceTomlEntry(raw, path, name, entry) {
  const { mixed, eol, lines } = splitLines(raw);
  if (mixed) throw new Error('mixed-newlines');
  const header = headerFor(path, name);
  const located = locateSection(lines, header);
  if (!located) throw new Error('entry-not-found');
  const body = sectionLines(header, entry);
  // 段前的那一个空行是我们插入时垫的（与删除时带走的那一个成对），替换时保持原样。
  const next = [...lines.slice(0, located.start), ...body, ...lines.slice(located.end)];
  return { text: next.join(eol), replaced: true };
}

/** 抹掉一个表段，连同我们自己垫在它前面的那一个空行；其余字节不动。 */
export function removeTomlEntry(raw, path, name) {
  const { mixed, eol, lines } = splitLines(raw);
  if (mixed) return { text: raw, changed: false, reason: 'mixed-newlines' };
  const header = headerFor(path, name);
  const located = locateSection(lines, header);
  if (!located) return { text: raw, changed: false, reason: 'entry-not-found' };
  let start = located.start;
  if (start > 0 && lines[start - 1].trim() === '') start -= 1;
  const next = [...lines.slice(0, start), ...lines.slice(located.end)];
  // 删到文件末尾时，把行尾收敛成**一个**换行——正好抵消插入时垫的那一个空行与尾换行。
  if (located.end === lines.length) {
    while (next.length && next[next.length - 1] === '') next.pop();
    if (next.length) next.push('');
  }
  return { text: next.join(eol), changed: true, removedName: name };
}
