import {
  getClientNativeProjectSourceFile,
  supportsClientCapability,
} from '../../clients/registry.mjs';

import {
  joinMarkdownSections,
  readClientMarkdownSource,
  readNativePartials,
} from './shared.mjs';

// 共享 section 计划：固定顺序，避免 managed-block 输出抖动。
// capability 为空表示对所有客户端发出；否则仅当客户端具备该能力时发出，
// 这样 gemini/opencode 不会被告知去用它们并未安装的 superpowers/agents。
const SHARED_SECTION_PLAN = Object.freeze([
  { file: 'core-instructions.md' },
  { file: 'contextdb.md' },
  { file: 'client-capabilities.md' },
  { file: 'superpowers.md', capability: 'superpowers' },
  { file: 'agent-routing.md', capability: 'agents' },
  { file: 'codemap.md', capability: 'native' },
  { file: 'browser-mcp.md' },
  { file: 'team-provider.md', capability: 'team' },
  { file: 'model-router.md', capability: 'team' },
  { file: 'harness.md' },
]);

// 能力感知地拼装某客户端的 native 指令正文：共享段（按能力过滤）+ 该客户端项目源段。
export function composeNativeMarkdown({ rootDir, client }) {
  const sharedFiles = SHARED_SECTION_PLAN
    .filter((section) => !section.capability || supportsClientCapability(client, section.capability))
    .map((section) => section.file);
  const sharedSections = readNativePartials(rootDir, sharedFiles);
  const projectSource = readClientMarkdownSource(rootDir, client, getClientNativeProjectSourceFile(client));
  return joinMarkdownSections([...sharedSections, projectSource]);
}
