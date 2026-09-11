/* 中文注释：Pi native emitter — AGENTS.md（条件）+ .pi/skills 管理面。Pi 无内置 MCP，工具经 AIOS Pi extension 桥接。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderPiNativeOutputs({ rootDir, selectedClients = ['pi'] }) {
  // AGENTS.md 与 codex/opencode/grok/hermes/workbuddy 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'pi');
  const targetPath = getClientInstructionFileName('pi');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'pi' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? ['.pi/skills']
    : [targetPath, '.pi/skills'];

  return {
    operations,
    managedTargets,
  };
}
