// scripts/lib/clients/mcp/formats/json-editor.mjs — JSON 落点的**文本级**增删。
//
// 为什么不复用 codemap 的 `writeJsonConfig`：它整份 `JSON.stringify(parsed, null, 2)` 重排
// （`codemap/targets/mcp-targets/json.mjs:38`），对**我们自己**的文件没问题，但本控制台的门是
// 「卸掉一个条目后，文件的其余字节不变」（ADR 0008 验收 2）。重排会让别人手写的条目换行、
// 缩进、键序全变——那是「管理」名义下的格式化破坏。所以这里只做定点手术：
//   · 插入 = 在目标桶的成员末尾追加一段文本；
//   · 删除 = 精确抹掉那一段（含它自己那一个逗号与其后空白），其余字节原样保留；
//   · 任何一次改动之后都必须 `JSON.parse` 通过，不过就**不写**（回退由调用方的备份负责）。
//
// 归属判定不在这一层：谁的名字能删是 w3 账本的事，这里只提供机械能力。

/** 跳过一段 JSON 字符串，返回闭合引号之后的下标。 */
function skipString(text, start) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '"') return i + 1;
    i += 1;
  }
  throw new Error('unterminated JSON string');
}

/** 返回从 `start` 开始的 JSON 值的结束下标（不含）。 */
export function scanValueEnd(text, start) {
  const ch = text[start];
  if (ch === undefined) throw new Error('empty JSON value');
  if (ch === '"' || ch === "'") return skipString(text, start);
  if (ch === '{' || ch === '[') {
    const closer = ch === '{' ? '}' : ']';
    let i = start;
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { i = skipString(text, i); continue; }
      if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) {
          if (c !== closer) throw new Error(`JSON bracket mismatch at ${i}`);
          return i + 1;
        }
      }
      i += 1;
    }
    throw new Error('unbalanced JSON brackets');
  }
  let i = start;
  while (i < text.length && !',}]'.includes(text[i])) i += 1;
  return i;
}

/**
 * 列出某个对象（`objStart` 指向 `{`）的直属成员位置。
 * 返回 `[{ key, keyStart, valueStart, valueEnd }]`，`keyStart` 指向键的起始引号。
 */
export function scanObjectMembers(text, objStart) {
  const members = [];
  let i = objStart;
  if (text[i] !== '{') throw new Error('expected object start');
  i += 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i += 1;
    if (text[i] === '}') return members;
    if (text[i] !== '"') throw new Error(`expected JSON key at ${i}`);
    const keyStart = i;
    const afterKey = skipString(text, i);
    const colon = text.indexOf(':', afterKey);
    if (colon < 0) throw new Error('missing JSON colon');
    let valueStart = colon + 1;
    while (/\s/.test(text[valueStart])) valueStart += 1;
    const valueEnd = scanValueEnd(text, valueStart);
    members.push({ key: JSON.parse(text.slice(keyStart, afterKey)), keyStart, valueStart, valueEnd });
    i = valueEnd;
  }
  throw new Error('unterminated JSON object');
}

/** 按点路径找到桶对象的 `{` 下标；`create` 时缺段可被调用方自行补，这里只负责定位。 */
export function findBucketStart(text, path) {
  let cursor = text.indexOf('{');
  if (cursor < 0) return -1;
  for (const segment of path) {
    let members;
    try {
      members = scanObjectMembers(text, cursor);
    } catch {
      return -1;
    }
    const hit = members.find((member) => member.key === segment);
    if (!hit) return -1;
    if (text[hit.valueStart] !== '{') return -1;
    cursor = hit.valueStart;
  }
  return cursor;
}

/** 读取桶里的条目名 → 原文切片（用于比对与指纹）。 */
export function readBucketEntries(text, path) {
  const bucketStart = findBucketStart(text, path);
  if (bucketStart < 0) return Object.freeze({ found: false, entries: {} });
  const entries = {};
  for (const member of scanObjectMembers(text, bucketStart)) {
    entries[member.key] = { raw: text.slice(member.valueStart, member.valueEnd), keyStart: member.keyStart, valueStart: member.valueStart, valueEnd: member.valueEnd };
  }
  return Object.freeze({ found: true, entries });
}

/** 从文件风格猜缩进：取桶第一个成员的键列与其值内部第一列的差，猜不到用两空格。 */
function detectIndentation(text, bucketStart) {
  const members = scanObjectMembers(text, bucketStart);
  const anchor = members.length ? members[0].keyStart : bucketStart;
  const lineStart = text.lastIndexOf('\n', anchor) + 1;
  const lineIndent = text.slice(lineStart, anchor).match(/^\s*/)[0];
  if (members.length) {
    const first = members[0];
    const valueText = text.slice(first.valueStart, first.valueEnd);
    const nested = valueText.match(/\n(\s+)"/);
    if (nested && nested[1].length > lineIndent.length) return { memberIndent: lineIndent, unit: nested[1].slice(lineIndent.length) };
    return { memberIndent: lineIndent, unit: lineIndent.length % 4 === 0 && lineIndent.includes('\t') ? '\t' : '  ' };
  }
  // 空桶：成员行必须落在「桶所在行的缩进 + 一个 unit」上，闭合括号回到行缩进。
  return { memberIndent: `${lineIndent}  `, unit: '  ' };
}

function serializeValue(value, memberIndent, unit) {
  const text = JSON.stringify(value, null, unit);
  // 除首行外整体再垫一层成员缩进，让插入的条目与文件既有风格同列。
  return text.split('\n').map((line, index) => (index === 0 ? line : memberIndent + line)).join('\n');
}

/**
 * 在桶里插入（或整体替换）一个条目。返回 `{ text, replaced }`。
 * `existing` 传入该名的既有原文切片以便判断是否需要替换。
 */
export function insertEntry(text, path, name, value) {
  let bucketStart = findBucketStart(text, path);
  let base = text;
  if (bucketStart < 0) {
    // 桶不存在：在根对象末尾补一个空桶（键序追加在最后，不动既有字节）。
    const rootStart = text.indexOf('{');
    if (rootStart < 0) throw new Error('not a JSON object');
    const rootEnd = scanValueEnd(base, rootStart) - 1;
    const members = scanObjectMembers(base, rootStart);
    const { memberIndent } = detectIndentation(base, rootStart);
    const bucketText = path.reduceRight((inner, segment) => `${JSON.stringify(segment)}: ${inner}`, '{}');
    const insertText = `${members.length ? ',' : ''}\n${memberIndent}${bucketText.split('\n').map((line, index) => (index === 0 ? line : memberIndent + line)).join('\n')}`;
    const anchor = members.length ? members[members.length - 1].valueEnd : rootEnd;
    base = `${base.slice(0, anchor)}${insertText}${base.slice(anchor)}`;
    bucketStart = findBucketStart(base, path);
    if (bucketStart < 0) throw new Error('failed to create bucket');
    // `createdBucket` 是给上层与 w3 账本的线索：桶是我们这次新建的，卸载最后一条时才有资格连桶一起收掉。
    const inner = insertEntry(base, path, name, value);
    return { ...inner, createdBucket: true };
  }

  const members = scanObjectMembers(base, bucketStart);
  const { memberIndent, unit } = detectIndentation(base, bucketStart);
  const valueText = serializeValue(value, memberIndent, unit);
  const hit = members.find((member) => member.key === name);
  if (hit) {
    const replaced = `${base.slice(0, hit.valueStart)}${valueText}${base.slice(hit.valueEnd)}`;
    return { text: replaced, replaced: true, createdBucket: false };
  }
  if (members.length === 0) {
    const open = bucketStart;
    const close = scanValueEnd(base, open) - 1;
    return { text: `${base.slice(0, open + 1)}\n${memberIndent}${JSON.stringify(name)}: ${valueText}\n${memberIndent.slice(0, Math.max(0, memberIndent.length - unit.length))}}${base.slice(close + 1)}`, replaced: false, createdBucket: false };
  }
  const last = members[members.length - 1];
  const insertAt = last.valueEnd;
  return { text: `${base.slice(0, insertAt)},\n${memberIndent}${JSON.stringify(name)}: ${valueText}${base.slice(insertAt)}`, replaced: false, createdBucket: false };
}

/**
 * 抹掉一个条目：删掉它的 `key: value` 连同**属于它的那一个逗号**与其后空白。
 * 条目不存在时返回 `{ changed: false }`，绝不猜测删除。
 */
export function removeEntry(text, path, name) {
  const bucketStart = findBucketStart(text, path);
  if (bucketStart < 0) return { text, changed: false, reason: 'bucket-not-found' };
  const members = scanObjectMembers(text, bucketStart);
  const index = members.findIndex((member) => member.key === name);
  if (index < 0) return { text, changed: false, reason: 'entry-not-found' };
  const target = members[index];
  let next;
  if (members.length === 1) {
    // 最后一个条目：桶收回成内联 `{}`。空桶在这些客户端里与「没有内容」等价，
    // 收回成 `{}` 是让「装→卸」能逐字节回到原样的唯一确定做法（原样保留多行空壳反而回不去）。
    // 桶自身要不要连着删掉由调用方按 provenance 决定（`residue: 'empty-bucket'`）。
    const close = scanValueEnd(text, bucketStart) - 1;
    next = `${text.slice(0, bucketStart + 1)}${text.slice(close)}`;
  } else if (index < members.length - 1) {
    next = `${text.slice(0, target.keyStart)}${text.slice(members[index + 1].keyStart)}`;
  } else {
    next = `${text.slice(0, members[index - 1].valueEnd)}${text.slice(target.valueEnd)}`;
  }
  // 桶被清空是我们自己插入留下的痕迹（`{}` 空桶对每家客户端都与「没有这个键」等价），
  // 但删键属于别人的排版，所以上层要不要连桶一起收掉由调用方按账本 provenance 决定。
  const remainingStart = findBucketStart(next, path);
  const residue = remainingStart >= 0 && scanObjectMembers(next, remainingStart).length === 0 ? 'empty-bucket' : '';
  return { text: next, changed: true, removedName: name, residue };
}
