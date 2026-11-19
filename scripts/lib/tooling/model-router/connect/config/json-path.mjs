// 中文注释：JSON 客户端配置的通用外科读写——按点分路径只碰我们管理的 key，其余字节结构保留。
// backup 形状固定：每个被管理路径记录原值（MISSING 表示该路径原本不存在），供 restore 精确还原。
export const MISSING = Symbol('missing');

export function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)\S/u);
  return match ? match[1] : '  ';
}

export function parseObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  const value = JSON.parse(trimmed);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError('client config must be a JSON object');
  return value;
}

export function serialize(value, indent) {
  return `${JSON.stringify(value, null, indent)}\n`;
}

function segments(path) {
  if (Array.isArray(path)) return path;
  return String(path).split('.').flatMap((part) => part.split(/\[(\d+)\]/u).filter((token) => token !== ''));
}

export function readPath(obj, path) {
  let cur = obj;
  for (const segment of segments(path)) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, segment)) return MISSING;
    cur = cur[segment];
  }
  return cur;
}

export function writePath(obj, path, value) {
  const parts = segments(path);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = parts[i + 1];
    if (cur[key] === null || typeof cur[key] !== 'object') cur[key] = /^\d+$/u.test(next) ? [] : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

export function deletePath(obj, path) {
  const parts = segments(path);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = cur?.[parts[i]];
    if (cur === null || typeof cur !== 'object') return;
  }
  if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
}

// writes: [[path, (params) => value], ...]，value===null 表示删除该路径。
export function editJson(text, writes, params) {
  const document = parseObject(text);
  const indent = detectIndent(text);
  const backup = {};
  for (const [path] of writes) backup[path] = readPath(document, path);
  // 记录所有原本不存在的父容器路径，restore 时若被清空则删除，避免留下 providers.aios:{} 空壳。
  const created = [];
  for (const [path] of writes) {
    const parts = segments(path);
    for (let i = 1; i <= parts.length - 1; i += 1) {
      const parent = parts.slice(0, i).join('\u0000'); // 用 NUL 分隔，避免与真实 key 中的点混淆
      if (!created.includes(parent) && readPath(document, parts.slice(0, i)) === MISSING) created.push(parent);
    }
  }
  for (const [path, valueOf] of writes) {
    const value = valueOf(params);
    if (value === null) deletePath(document, path);
    else writePath(document, path, value);
  }
  // backup 里的 Symbol 不能 JSON 化；归一成 null + 单独的存在标记。
  const normalized = Object.fromEntries(Object.entries(backup).map(([key, value]) => [key, value === MISSING ? null : value]));
  normalized.__created = created;
  return { text: serialize(document, indent), backup: normalized, changedKeys: writes.map(([path]) => path) };
}

export function restoreJson(text, writes, backup) {
  const document = parseObject(text);
  const indent = detectIndent(text);
  for (const [path] of writes) {
    const value = backup[path];
    if (value === null || value === undefined) deletePath(document, path);
    else writePath(document, path, value);
  }
  // 从最深往浅删，避免先删父后子路径失效。
  const created = [...(backup.__created || [])].sort((a, b) => b.length - a.length);
  for (const encoded of created) {
    const parts = encoded.split('\u0000');
    const node = readPath(document, parts);
    if (node && typeof node === 'object' && !Array.isArray(node) && Object.keys(node).length === 0) deletePath(document, parts);
  }
  return serialize(document, indent);
}
