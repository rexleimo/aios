import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';
import { readOptionalClientJson } from './shared.mjs';

export function renderCodexNativeOutputs({ rootDir }) {
  const hookSource = readOptionalClientJson(rootDir, 'codex', 'hooks.json');
  const operations = [
    {
      kind: 'markdown-block',
      targetPath: getClientInstructionFileName('codex'),
      content: composeNativeMarkdown({ rootDir, client: 'codex' }),
    },
  ];
  const managedTargets = ['AGENTS.md', '.codex/agents', '.codex/skills'];
  if (hookSource) {
    operations.push({
      kind: 'json-top-level-merge',
      targetPath: '.codex/hooks.json',
      content: hookSource,
    });
    managedTargets.push('.codex/hooks.json');
  }
  return { operations, managedTargets };
}
