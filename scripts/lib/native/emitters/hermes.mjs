/* 中文注释：Hermes Agent native emitter — AGENTS.md（条件）+ .hermes/skills 管理面。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';

export function renderHermesNativeOutputs({ rootDir, selectedClients = ['hermes'] }) {
  // AGENTS.md 与 codex/opencode/grok 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const selected = new Set(selectedClients);
  const agentsOwnerSelected = selected.has('codex') || selected.has('opencode') || selected.has('grok');
  const targetPath = getClientInstructionFileName('hermes');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'hermes' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? ['.hermes/skills']
    : [targetPath, '.hermes/skills'];

  return {
    operations,
    managedTargets,
  };
}
