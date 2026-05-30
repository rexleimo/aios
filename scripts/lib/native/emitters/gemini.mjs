import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';

export function renderGeminiNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('gemini'),
        content: composeNativeMarkdown({ rootDir, client: 'gemini' }),
      },
    ],
    managedTargets: ['GEMINI.md', '.gemini/commands'],
  };
}
