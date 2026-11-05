// scripts/lib/clients/mcp/formats/yaml-editor.mjs — YAML 落点（hermes 的 `mcp_servers.<name>`）增删。
//
// 这里**不**手搓行扫描：w1 已经吃过一次亏（自写的按空格猜缩进的脚本，把 hermes 的桶读成
// `mcp_servers.mcp.<name>`，结论已作废，见 ADR 0008 决策 6 的更正）。结构性事实一律交给 `yaml` 解析器。
// 用 Document API（`setIn` / `deleteIn`）而不是 `parse → 改 → stringify`：前者保留未改动节点的
// 原始风格与注释，才可能满足「卸掉一个条目后文件的其余字节不变」这条门。
//
// 归属判定不在这一层：谁的名字能删是 w3 账本的事。
import { isDeepStrictEqual } from 'node:util';

import { parseDocument } from 'yaml';

function loadDocument(raw, { create = false } = {}) {
  const document = parseDocument(raw || '{}\n');
  if (document.errors.length > 0) {
    throw new Error(`yaml-parse-failed: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  if (!document.contents) {
    if (!create) throw new Error('yaml-document-empty');
    document.contents = document.createNode({});
  }
  return document;
}

/**
 * `Document.getIn(path)` 返回的是 **YAML 节点**（带 `items`/`range`/`commentBefore`），第二参
 * `keepScalar` 只对纯量解包；拿节点当普通对象查条目名会静默查不到（w2 实测踩过一次，
 * 表现是「装成功了但读回没有」）。所以读一律走 `toJS()` 的 JS 视图，节点只用于写。
 */
function plainBucket(document, path) {
  const node = document.getIn(path);
  if (node == null) return undefined;
  // 节点的 `toJS` 要显式带所属 document（`A document argument is required`）。
  return typeof node.toJS === 'function' ? node.toJS(document) : node;
}

/**
 * 桶里的条目名 → 值对象。桶不存在时 `found: false`。
 * 注意 `getIn(path)` 的第二参是 `keep`：传 `true` 会返回 YAML 节点（`items`/`range`/`commentBefore`），
 * 拿它当普通对象查键名会静默查不到——本模块一律用 `keep=false` 的 JS 视图判断，节点只用于写。
 */
export function readYamlEntries(raw, path) {
  let document;
  try {
    document = loadDocument(raw);
  } catch (error) {
    if (String(error.message).startsWith('yaml-document-empty')) return Object.freeze({ found: false, entries: {} });
    throw error;
  }
  const bucket = plainBucket(document, path);
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return Object.freeze({ found: false, entries: {} });
  return Object.freeze({ found: true, entries: bucket });
}

/** 追加一个条目。同名已存在即抛 `entry-exists`，由调用方判 unchanged / conflict。 */
export function insertYamlEntry(raw, path, name, entry) {
  const document = loadDocument(raw, { create: true });
  let createdBucket = false;
  if (plainBucket(document, path) === undefined) {
    document.setIn(path, {});
    createdBucket = true;
  }
  const bucket = plainBucket(document, path);
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) throw new Error('landing-bucket-not-a-map');
  if (Object.prototype.hasOwnProperty.call(bucket, name)) throw new Error('entry-exists');
  document.setIn([...path, name], entry);
  return { text: String(document), replaced: false, createdBucket };
}

/** 已存在且形状不同时给出既有值，供 conflict 判定。 */
export function findYamlEntry(raw, path, name) {
  const entries = readYamlEntries(raw, path).entries;
  return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : undefined;
}

export function yamlEntriesEqual(a, b) {
  return isDeepStrictEqual(a, b);
}

/** 抹掉一个条目；桶空了就留着空桶，并把残留如实报给调用方（不偷偷删别人的键）。 */
export function removeYamlEntry(raw, path, name) {
  const document = loadDocument(raw);
  const bucket = plainBucket(document, path);
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return { text: raw, changed: false, reason: 'bucket-not-found' };
  if (!Object.prototype.hasOwnProperty.call(bucket, name)) return { text: raw, changed: false, reason: 'entry-not-found' };
  document.deleteIn([...path, name]);
  const remaining = plainBucket(document, path) || {};
  const residue = Object.keys(remaining).length === 0 ? 'empty-bucket' : '';
  return { text: String(document), changed: true, removedName: name, residue };
}
