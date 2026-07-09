/* 中文注释：Grok Build native emitter — skills/agents 根 + 条件写入 AGENTS.md。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';

export function renderGrokNativeOutputs({ rootDir, selectedClients = ['grok'] }) {
  // AGENTS.md 与 codex/opencode/hermes 共用。codex 或 opencode 已负责写入时不再重复。
  const selected = new Set(selectedClients);
  const agentsOwnerSelected = selected.has('codex') || selected.has('opencode');
  const targetPath = getClientInstructionFileName('grok');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'grok' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? ['.grok/skills', '.grok/agents']
    : [targetPath, '.grok/skills', '.grok/agents'];

  return {
    operations,
    managedTargets,
  };
}
