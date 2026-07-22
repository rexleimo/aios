import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';

export function renderCodexNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('codex'),
        content: composeNativeMarkdown({ rootDir, client: 'codex' }),
      },
    ],
    managedTargets: ['AGENTS.md', '.codex/agents', '.codex/skills'],
  };
}
