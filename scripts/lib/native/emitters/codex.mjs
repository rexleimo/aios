import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';
import { joinMarkdownSections, readClientMarkdownSource } from './shared.mjs';

export function renderCodexNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('codex'),
        // Codex 与 OpenCode 共用 AGENTS.md：codex 正文之后追加 opencode 兼容说明，
        // 以便当两者同时选择时 opencode 自身不再单独写 AGENTS.md（见 opencode.mjs 去重）。
        content: joinMarkdownSections([
          composeNativeMarkdown({ rootDir, client: 'codex' }),
          readClientMarkdownSource(rootDir, 'opencode', 'AIOS.md'),
        ]),
      },
    ],
    managedTargets: ['AGENTS.md', '.codex/agents', '.codex/skills'],
  };
}
