import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';

export function renderCrushNativeOutputs({ rootDir, selectedClients = ['crush'] }) {
  // Crush auto-loads AGENTS.md (same file as codex/opencode). When codex is also
  // selected, the codex emitter already writes AGENTS.md with the shared content;
  // crush's native block would be appended inside the same managed block, so we
  // skip writing to avoid double-coverage. When codex is absent, crush writes it.
  const codexSelected = new Set(selectedClients).has('codex');
  const targetPath = getClientInstructionFileName('crush');
  const operations = codexSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'crush' }),
        },
      ];
  const managedTargets = codexSelected
    ? ['.crush/skills']
    : [targetPath, '.crush/skills'];

  return {
    operations,
    managedTargets,
  };
}
