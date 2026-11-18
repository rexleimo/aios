import { getClientInstructionFileName } from '../../../../foundation/clients/registry.mjs';

import { composeNativeMarkdown } from './compose.mjs';
import { readClientJsonSource } from './shared.mjs';

export function renderClaudeNativeOutputs({ rootDir }) {
  const source = readClientJsonSource(rootDir, 'claude', 'settings.local.json');
  const operations = [
    {
      kind: 'markdown-block',
      targetPath: getClientInstructionFileName('claude'),
      content: composeNativeMarkdown({ rootDir, client: 'claude' }),
    },
    {
      kind: 'json-merge',
      targetPath: '.claude/settings.local.json',
      content: source,
    },
  ];
  /* 中文注释：`aiosNative` 是 AIOS 自己的账本键，Claude Code 从不读它——写在里面的
   * statusLine 与 hooks 一样永不生效。真正的槽位在顶层，而 statusLine 全局只有一个，
   * 用户可能已经在用，所以走 default-merge：只补缺，不覆盖用户已配的值。 */
  if (source && typeof source === 'object' && source.statusLine) {
    operations.push({
      kind: 'json-default-merge',
      targetPath: '.claude/settings.local.json',
      content: { statusLine: source.statusLine },
    });
  }
  return {
    operations,
    managedTargets: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'],
  };
}
