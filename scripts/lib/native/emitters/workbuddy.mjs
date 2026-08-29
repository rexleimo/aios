/* 中文注释：WorkBuddy native emitter — AGENTS.md（条件）+ .workbuddy/skills 管理面。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderWorkbuddyNativeOutputs({ rootDir, selectedClients = ['workbuddy'] }) {
  // AGENTS.md 与 codex/opencode/grok/hermes 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'workbuddy');
  const targetPath = getClientInstructionFileName('workbuddy');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'workbuddy' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? ['.workbuddy/skills']
    : [targetPath, '.workbuddy/skills'];

  return {
    operations,
    managedTargets,
  };
}
