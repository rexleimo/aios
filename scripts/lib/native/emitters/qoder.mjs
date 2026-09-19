/* 中文注释：Qoder native emitter — AGENTS.md（条件）+ .qoder/skills 管理面。Qoder
   官方文档验证的项目技能根是 .qoder/skills（SKILL.md 目录格式）；共享 .agents/skills
   的扫描能力未验证，因此 AIOS 只写 Qoder 自己的根。MCP 走注册表声明的
   settings.json mcpServers 迁移。 */
import { getClientInstructionFileName, getClientProjectSkillRoot } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderQoderNativeOutputs({ rootDir, selectedClients = ['qoder'] }) {
  // AGENTS.md 与 codex/opencode/grok/hermes/workbuddy/pi/zcode 共用。任一共写方已选中时不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'qoder');
  const targetPath = getClientInstructionFileName('qoder');
  const qoderSkillRoot = getClientProjectSkillRoot('qoder');
  const operations = agentsOwnerSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'qoder' }),
        },
      ];
  const managedTargets = agentsOwnerSelected
    ? [qoderSkillRoot]
    : [targetPath, qoderSkillRoot];

  return {
    operations,
    managedTargets,
  };
}
