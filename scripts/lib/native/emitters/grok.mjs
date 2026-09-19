/* 中文注释：Grok Build native emitter — skills/agents 根 + 条件写入 AGENTS.md。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer, readOptionalClientJson } from './shared.mjs';

export function renderGrokNativeOutputs({ rootDir, selectedClients = ['grok'] }) {
  // AGENTS.md 共写优先级见 shared.mjs；grok 只在更靠前的共写方入选时让位。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'grok');
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
  const hookSource = readOptionalClientJson(rootDir, 'grok', 'hooks/aios-workflow.json');
  const managedTargets = agentsOwnerSelected
    ? ['.grok/skills', '.grok/agents']
    : [targetPath, '.grok/skills', '.grok/agents'];
  if (hookSource) {
    operations.push({
      kind: 'json-top-level-merge',
      targetPath: '.grok/hooks/aios-workflow.json',
      content: hookSource,
    });
    managedTargets.push('.grok/hooks/aios-workflow.json');
  }

  return {
    operations,
    managedTargets,
  };
}
