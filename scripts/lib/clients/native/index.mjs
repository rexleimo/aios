import path from 'node:path';

import {
  CLIENT_DEFINITIONS,
  CLIENT_MCP_TARGETS,
} from '../core/definitions.mjs';
import {
  assertKnownClient,
  normalizeClientValue,
} from '../core/selection.mjs';

// 纯函数：读取单个客户端定义，不触发任何文件系统或环境副作用。
function getClientDefinition(client) {
  const normalized = assertKnownClient(normalizeClientValue(client));
  return CLIENT_DEFINITIONS[normalized];
}

function normalizeClient(client) {
  return assertKnownClient(normalizeClientValue(client));
}

// 纯函数：返回该客户端原生自动加载的指令文件名（CLAUDE.md/AGENTS.md/GEMINI.md），
// 供 native emitter 取代硬编码 targetPath。
export function getClientInstructionFileName(client) {
  return getClientDefinition(client).instructionFileName;
}

// 纯函数：返回该客户端 MCP 配置的描述 {format,namespace,scopes:[{scope,file}...]}。
export function getClientMcpTarget(client) {
  return CLIENT_MCP_TARGETS[normalizeClient(client)];
}

// 纯函数：把 MCP 落点解析为绝对路径列表（支持双作用域）。home 作用域用 clientHome，project 作用域用 projectRoot。
// base 缺失时跳过对应 scope。
export function resolveClientMcpTargetPaths(client, { projectRoot = '', clientHome = '' } = {}) {
  const target = getClientMcpTarget(client);
  return target.scopes
    .map((s) => {
      const base = s.scope === 'home' ? clientHome : projectRoot;
      if (!base) return null;
      return { path: path.join(base, s.file), scope: s.scope, format: target.format, namespace: target.namespace };
    })
    .filter(Boolean);
}

// 向后兼容：返回主要（首个 project scope 否则首个）路径。
export function resolveClientMcpTargetPath(client, { projectRoot = '', clientHome = '' } = {}) {
  const paths = resolveClientMcpTargetPaths(client, { projectRoot, clientHome });
  return paths.length > 0 ? paths[0].path : '';
}

// 纯函数：返回该客户端在 client-sources/native-base/<client>/project/ 下的 markdown 源文件名。
export function getClientNativeProjectSourceFile(client) {
  return getClientDefinition(client).nativeProjectSourceFile;
}
