import { ALL_CLIENTS } from '../../clients/registry.mjs';
import { renderClaudeNativeOutputs } from '../emitters/claude.mjs';
import { renderCodexNativeOutputs } from '../emitters/codex.mjs';
import { renderGrokNativeOutputs } from '../emitters/grok.mjs';
import { renderOpencodeNativeOutputs } from '../emitters/opencode.mjs';
import { makeInstructionMarkdownEmitter } from '../emitters/instruction-markdown.mjs';

/* 中文注释：只有带额外落盘副作用的客户端需要点名（codex hooks、claude settings、
   grok hooks+agents、opencode config+agent）；其余客户端的 native 输出形状一致，
   由注册表的 instructionFileName/projectSkillRoot 派生，新增客户端不必再改这里。 */
const CUSTOM_EMITTERS = Object.freeze({
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
  grok: renderGrokNativeOutputs,
});

for (const client of Object.keys(CUSTOM_EMITTERS)) {
  if (!ALL_CLIENTS.includes(client)) {
    throw new Error(`Native emitter wired for unknown client: ${client}`);
  }
}

export const EMITTERS = Object.freeze(Object.fromEntries(
  ALL_CLIENTS.map((client) => [client, CUSTOM_EMITTERS[client] ?? makeInstructionMarkdownEmitter(client)]),
));
export const SYNC_LOCK_NAME = 'native-skills-sync';
