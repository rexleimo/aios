/* 中文注释：Pi native emitter — AGENTS.md（条件）+ 共享技能根管理面。Pi 原生扫描
   Agent Skills 标准根（含共享 .agents/skills），AIOS 不再写 .pi/skills：两处同名
   技能会让 Pi 报“已加载并跳过共享路径副本”，技能只落共享根。Pi 无内置 MCP，工具经 AIOS Pi extension 桥接。 */
import { getClientInstructionFileName, getClientProjectSkillRoot } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderPiNativeOutputs({ rootDir, selectedClients = ['pi'] }) {
  // AGENTS.md 与 codex/opencode/grok/hermes/workbuddy 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'pi');
  const targetPath = getClientInstructionFileName('pi');
  const piSkillRoot = getClientProjectSkillRoot('pi');
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
    ? [piSkillRoot]
    : [targetPath, piSkillRoot];

  return {
    operations,
    managedTargets,
  };
}
