import { getClientInstructionFileName } from '../../clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';

export function renderOpencodeNativeOutputs({ rootDir, selectedClients = ['opencode'] }) {
  // OpenCode 读取 AGENTS.md。当 codex 也在本次选择中时，AGENTS.md 由 codex emitter
  // 统一产出（已追加 opencode 兼容段），此处不再重复写，避免互相覆盖。
  const codexSelected = new Set(selectedClients).has('codex');
  const targetPath = getClientInstructionFileName('opencode');
  const operations = codexSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath,
          content: composeNativeMarkdown({ rootDir, client: 'opencode' }),
        },
      ];
  const managedTargets = codexSelected
    ? ['.opencode/skills']
    : [targetPath, '.opencode/skills'];

  return {
    operations,
    managedTargets,
  };
}
