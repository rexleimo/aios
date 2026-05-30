import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';
import { readClientJsonSource } from './shared.mjs';

export function renderClaudeNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('claude'),
        content: composeNativeMarkdown({ rootDir, client: 'claude' }),
      },
      {
        kind: 'json-merge',
        targetPath: '.claude/settings.local.json',
        content: readClientJsonSource(rootDir, 'claude', 'settings.local.json'),
      },
    ],
    managedTargets: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'],
  };
}
