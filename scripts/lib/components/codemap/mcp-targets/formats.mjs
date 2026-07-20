import { inspectJsonNamespace, injectCrgIntoMcpJson, injectCrgIntoOpencodeJson, removeCrgFromMcpJson, removeCrgFromOpencodeJson } from './json.mjs';
import { inspectCodexToml, removeCrgFromCodexToml, upsertCodexMcpToml } from './toml.mjs';
import { inspectHermesYaml, removeCrgFromHermesYaml, upsertCrgIntoHermesYaml } from './yaml.mjs';

const CODEMAP_TARGET_FORMATS = Object.freeze({
  'codex-toml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCodexMcpToml(target.path, projectRoot, options),
    remove: (target, options) => removeCrgFromCodexToml(target.path, options),
    inspect: (raw) => inspectCodexToml(raw),
  }),
  'opencode-json': Object.freeze({
    inject: (target, _projectRoot, options) => injectCrgIntoOpencodeJson(target.path, options),
    remove: (target, options) => removeCrgFromOpencodeJson(target.path, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcp'),
  }),
  'mcp-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target.path, target.clientKey, projectRoot, options),
    remove: (target, options) => removeCrgFromMcpJson(target.path, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcpServers'),
  }),
  'hermes-yaml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCrgIntoHermesYaml(target.path, projectRoot, options),
    remove: (target, options) => removeCrgFromHermesYaml(target.path, options),
    inspect: (raw) => inspectHermesYaml(raw),
  }),
});

// 纯函数：按目标格式选择 MCP 读写策略，避免安装/医生流程维护格式分支。
export function getCodemapTargetFormat(format = 'mcp-json') {
  return CODEMAP_TARGET_FORMATS[format] || CODEMAP_TARGET_FORMATS['mcp-json'];
}
