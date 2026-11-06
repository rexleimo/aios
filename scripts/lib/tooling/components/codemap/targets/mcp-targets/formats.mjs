// scripts/lib/tooling/components/codemap/targets/mcp-targets/formats.mjs — 落点格式 → 读写策略（唯一分派处）。
//
// w5b 收编后这层只剩「按格式选策略」：三种家族（JSON 点路径 / TOML 表段 / YAML 映射）各自的写盘手术
// 都在 `clients/mcp/server-writer.mjs`，本层与 `landing-writer.mjs` 只负责把 codemap 的**策略**
// （条目形状、合并语义、schema 规范化）接到那条通用路径上。
//
// 一处行为修正是刻意的：旧实现 `CODEMAP_TARGET_FORMATS[format] || CODEMAP_TARGET_FORMATS['mcp-json']`
// 会把拼错的格式标签（如 `toml` / `none`）**当 JSON 写进 config.toml**。未知格式现在返回 null，
// 由调用方报机器可读的 `format-not-wired:<label>`——静默兜底写错文件比拒绝更糟。
import { normalizeZcodeServerEntry } from '../../../../../foundation/clients/integration/mcp/zcode-schema.mjs';

import { injectCrgIntoMcpJson, injectCrgIntoOpencodeJson, inspectJsonNamespace, removeCrgFromMcpJson, removeCrgFromNestedJson, removeCrgFromOpencodeJson } from './json.mjs';
import { inspectCodexToml, removeCrgFromCodexToml, upsertCodexMcpToml } from './toml.mjs';
import { inspectHermesYaml, removeCrgFromHermesYaml, upsertCrgIntoHermesYaml } from './yaml.mjs';

const CODEMAP_TARGET_FORMATS = Object.freeze({
  'codex-toml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCodexMcpToml(target, projectRoot, options),
    remove: (target, options) => removeCrgFromCodexToml(target, options),
    inspect: (raw) => inspectCodexToml(raw),
  }),
  'opencode-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoOpencodeJson(target, projectRoot, options),
    remove: (target, options) => removeCrgFromOpencodeJson(target, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcp'),
  }),
  'mcp-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target, projectRoot, options),
    remove: (target, options) => removeCrgFromMcpJson(target, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcpServers'),
  }),
  // zcode 专用：server schema 是严格白名单（未知字段会被整条丢弃），因此落盘前必须按共享白名单规范化。
  // 桶的点路径（`mcp.servers`）不再由这里传：落点表是它的唯一所有者。
  'mcp-json-nested': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target, projectRoot, {
      ...options,
      normalizeEntry: normalizeZcodeServerEntry,
    }),
    remove: (target, options) => removeCrgFromNestedJson(target, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcp.servers'),
  }),
  // pi 的 mcp.json 是标准 mcpServers，但条目形状由 pi 组件定义（无 type、有 lifecycle），
  // 见 entries.mjs 的 buildCrgPiEntry。单独成格式，避免与通用 mcp-json 的合并语义混淆。
  'pi-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target, projectRoot, options),
    remove: (target, options) => removeCrgFromMcpJson(target, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcpServers'),
  }),
  'hermes-yaml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCrgIntoHermesYaml(target, projectRoot, options),
    remove: (target, options) => removeCrgFromHermesYaml(target, options),
    inspect: (raw) => inspectHermesYaml(raw),
  }),
});

/**
 * 纯函数：按目标格式选择 MCP 读写策略；未知格式返回 `null`（不是「当 JSON 处理」）。
 * 调用方必须把 `null` 变成机器可读的拒绝，否则「格式标签拼错」会被写成「JSON 写进了别人的 TOML」。
 */
export function getCodemapTargetFormat(format = 'mcp-json') {
  return CODEMAP_TARGET_FORMATS[format] || null;
}

/** 已接线的格式标签（拒绝时回报，避免「不知道支持什么」）。 */
export function listCodemapTargetFormats() {
  return Object.freeze(Object.keys(CODEMAP_TARGET_FORMATS));
}