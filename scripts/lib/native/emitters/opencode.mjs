import { getClientInstructionFileName } from '../../clients/registry.mjs';
import {
  OPENCODE_STRICT_PRIMARY_AGENT_PATH,
  renderOpenCodeStrictPrimaryAgent,
} from '../../opencode/strict-primary-agent.mjs';
import {
  buildOpenCodeConfig,
  OPENCODE_CONFIG_PATH,
} from '../../opencode/config.mjs';

import { composeNativeMarkdown } from './compose.mjs';
import { isAgentsMdClaimedByPeer } from './shared.mjs';

export function renderOpencodeNativeOutputs({ rootDir, selectedClients = ['opencode'] }) {
  // OpenCode 读取 AGENTS.md。当更高优先级的共写方（codex）也在本次选择中时，AGENTS.md
  // 由它统一产出（已追加 opencode 兼容段），此处不再重复写，避免互相覆盖。
  const agentsOwnerSelected = isAgentsMdClaimedByPeer(selectedClients, 'opencode');
  const targetPath = getClientInstructionFileName('opencode');
  const operations = [
    ...(
      agentsOwnerSelected
        ? []
        : [
            {
              kind: 'markdown-block',
              targetPath,
              content: composeNativeMarkdown({ rootDir, client: 'opencode' }),
            },
          ]
    ),
    {
      kind: 'managed-exact-file',
      targetPath: OPENCODE_STRICT_PRIMARY_AGENT_PATH,
      content: renderOpenCodeStrictPrimaryAgent(),
    },
    {
      kind: 'json-top-level-merge',
      targetPath: OPENCODE_CONFIG_PATH,
      content: buildOpenCodeConfig(),
    },
  ];
  const managedTargets = agentsOwnerSelected
    ? ['.opencode/skills', OPENCODE_STRICT_PRIMARY_AGENT_PATH, OPENCODE_CONFIG_PATH]
    : [targetPath, '.opencode/skills', OPENCODE_STRICT_PRIMARY_AGENT_PATH, OPENCODE_CONFIG_PATH];

  return {
    operations,
    managedTargets,
  };
}
