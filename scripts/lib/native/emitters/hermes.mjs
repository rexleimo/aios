/* 中文注释：Hermes Agent native emitter — 生成 AGENTS.md + MCP 配置。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { readClientJsonSource } from './shared.mjs';

export function renderHermesNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('hermes'),
        content: composeNativeMarkdown({ rootDir, client: 'hermes' }),
      },
    ],
    managedTargets: ['AGENTS.md', '.hermes/skills'],
  };
}
