/* 中文注释：只输出“指令文件 + 技能根”的客户端共用 emitter（gemini/hermes/workbuddy/
   pi/zcode/qoder）。差异全部来自注册表的 instructionFileName 与 projectSkillRoot，
   因此不再逐客户端复制模块。有额外落盘副作用的客户端（codex hooks、claude settings、
   grok hooks+agents、opencode config+agent）保留各自的 emitter。 */
import { getClientInstructionFileName, getClientProjectSkillRoot } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function makeInstructionMarkdownEmitter(client) {
  const targetPath = getClientInstructionFileName(client);
  const skillRoot = getClientProjectSkillRoot(client);

  return function renderInstructionMarkdownOutputs({ rootDir, selectedClients = [client] }) {
    // AGENTS.md 由共写方里优先级最高的一个负责；已被认领时本客户端不再重复写，避免互相覆盖。
    const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, client);
    return {
      operations: agentsOwnerSelected
        ? []
        : [
            {
              kind: 'markdown-block',
              targetPath,
              content: composeNativeMarkdown({ rootDir, client }),
            },
          ],
      managedTargets: agentsOwnerSelected ? [skillRoot] : [targetPath, skillRoot],
    };
  };
}
