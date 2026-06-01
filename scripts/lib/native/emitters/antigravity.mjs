import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';

// Antigravity CLI (Google) — successor to Gemini CLI.
// Conservative assumption: inherits GEMINI.md and .gemini/skills paths.
// If Antigravity CLI changes these paths after install verification, update here.
export function renderAntigravityNativeOutputs({ rootDir, selectedClients = ['antigravity'] }) {
  // Antigravity shares the same GEMINI.md as Gemini. When gemini is also selected,
  // the gemini emitter already writes GEMINI.md — avoid double-coverage.
  const geminiSelected = new Set(selectedClients).has('gemini');
  if (geminiSelected) {
    return { operations: [], managedTargets: ['.gemini/skills'] };
  }
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: getClientInstructionFileName('gemini'),  // GEMINI.md
        content: composeNativeMarkdown({ rootDir, client: 'antigravity' }),
      },
    ],
    managedTargets: ['GEMINI.md', '.gemini/skills'],
  };
}
