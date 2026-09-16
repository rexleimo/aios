/* 中文注释：ZCode native emitter — AGENTS.md（条件）+ 共享技能根管理面。ZCode 原生
   扫描 Agent Skills 标准根（workspace 级 .zcode/skills 与共享 .agents/skills，.zcode 优先），
   AIOS 只投共享根：两处同名技能会让高优先级的 .zcode/skills 副本遮蔽共享投影，
   技能只落 .agents/skills。MCP 走注册表声明的嵌套 mcp.servers 配置迁移。 */
import { getClientInstructionFileName, getClientProjectSkillRoot } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderZcodeNativeOutputs({ rootDir, selectedClients = ['zcode'] }) {
  // AGENTS.md 与 codex/opencode/grok/hermes/workbuddy/pi 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'zcode');
  const targetPath = getClientInstructionFileName('zcode');
  const zcodeSkillRoot = getClientProjectSkillRoot('zcode');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'zcode' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? [zcodeSkillRoot]
    : [targetPath, zcodeSkillRoot];

  return {
    operations,
    managedTargets,
  };
}
