// scripts/lib/clients/mcp/formats/families.mjs — 落点格式 → 文本手术家族（谁都不许再抄第二份）。
//
// 为什么单独成文件：server-writer 既要接落点表、又要做「先算后写」的纯计算、还要管备份与原子写，
// 把三种格式家族表也塞在里面会越过 400 行预算。家族表本身是**纯文本知识**（怎么读、怎么插、怎么删、
// 落盘前怎么复核），与磁盘策略无关，所以它和三个 editor 一样住在 formats/ 下。
//
// 一个刻意的分工：FORMAT_FAMILY 描述「声明表的 format 标签 → 用哪把手术刀」，
// 未知标签返回 null（由调用方判 format-not-wired），绝不回落到 JSON——
// codemap 旧实现就是回落到 mcp-json，于是拼错的 toml 标签会把 JSON 写进 config.toml。
import { dropRootKeys, ensureRootKeys, hasRootKey, insertEntry, readBucketEntries, removeEntry } from './json-editor.mjs';
import { insertTomlEntry, readTomlEntries, removeTomlEntry, replaceTomlEntry } from './toml-editor.mjs';
import { insertYamlEntry, readYamlEntries, removeYamlEntry, replaceYamlEntry } from './yaml-editor.mjs';
/** 声明表的 format → 文本手术家族。JSON 的四种方言共用同一把手术刀，差别只在白名单与归一化。 */
const FORMAT_FAMILY = Object.freeze({
  json: 'json',
  'gemini-json': 'json',
  'zcode-json': 'json',
  'opencode-json': 'json',
  toml: 'toml',
  yaml: 'yaml',
});

const FAMILIES = Object.freeze({
  json: {
    read(raw, entryPath) {
      // 整份可解析是动手的前提：不合法就抛，调用方拒绝写——绝不基于半截理解去改别人的文本。
      JSON.parse(raw);
      const bucket = readBucketEntries(raw, entryPath);
      const entries = {};
      for (const [name, record] of Object.entries(bucket.entries)) {
        try {
          entries[name] = JSON.parse(record.raw);
        } catch {
          entries[name] = null; // 读不回即 null，交给 conflict 判定，绝不猜
        }
      }
      return { found: bucket.found, entries };
    },
    insert(raw, entryPath, name, entry) {
      return insertEntry(raw || '{}\n', entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      const parsed = JSON.parse(text);
      const bucket = entryPath.reduce((node, segment) => (node == null ? node : node[segment]), parsed);
      return Boolean(bucket) && Object.prototype.hasOwnProperty.call(bucket, name);
    },
    parseable(text) {
      JSON.parse(text);
      return true;
    },
    // 同名条目原地改写：`insertEntry` 命中已有键时替换它的值切片、位置与别人的字节都不动（`:161-165`）。
    replace(raw, entryPath, name, entry) {
      const before = readBucketEntries(raw, entryPath);
      if (!Object.prototype.hasOwnProperty.call(before.entries, name)) throw new Error('entry-not-found');
      return insertEntry(raw, entryPath, name, entry);
    },
    // 桶外根键只有 JSON 家族需要（今天唯一声明它的是 opencode）；toml/yaml 没声明过，
    // 真声明了就走下面的 `root-keys-unsupported-family`，不静默忽略。
    rootKeys: { ensure: ensureRootKeys, drop: dropRootKeys, has: hasRootKey },
  },
  toml: {
    read(raw, entryPath) {
      return readTomlEntries(raw, entryPath);
    },
    insert(raw, entryPath, name, entry) {
      return insertTomlEntry(raw, entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeTomlEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      return Object.prototype.hasOwnProperty.call(readTomlEntries(text, entryPath).entries, name);
    },
    parseable() {
      // TOML 这层没有整份 parser：读写都走行定位，删除后由 readTomlEntries 复核条目确实消失。
      return true;
    },
    replace(raw, entryPath, name, entry) {
      return replaceTomlEntry(raw, entryPath, name, entry);
    },
  },
  yaml: {
    read(raw, entryPath) {
      return readYamlEntries(raw, entryPath);
    },
    insert(raw, entryPath, name, entry) {
      return insertYamlEntry(raw, entryPath, name, entry);
    },
    remove(raw, entryPath, name) {
      return removeYamlEntry(raw, entryPath, name);
    },
    validate(text, entryPath, name) {
      return Object.prototype.hasOwnProperty.call(readYamlEntries(text, entryPath).entries, name);
    },
    parseable(text) {
      // `yaml` 解析失败会抛，正是我们要的拒绝信号。
      readYamlEntries(text, ['__rex_absent_probe__']);
      return true;
    },
    replace(raw, entryPath, name, entry) {
      return replaceYamlEntry(raw, entryPath, name, entry);
    },
  },
});
export function familyFor(landing) {
  const key = FORMAT_FAMILY[landing.format];
  return key ? FAMILIES[key] : null;
}

/** 已接线的家族名（拒绝时回报，便于说明「支持什么」）。 */
export function listFormatFamilies() {
  return Object.freeze(Object.keys(FAMILIES));
}
