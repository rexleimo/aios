/* 中文注释：Grok Build agent 落点 `.grok/agents/<name>.md`（markdown frontmatter，与 Claude 形状兼容）。 */
import { renderManagedAgentContent } from './shared.mjs';

export function renderGrokAgent(agent) {
  return {
    targetRelPath: `.grok/agents/${agent.name}.md`,
    content: renderManagedAgentContent(agent),
  };
}
