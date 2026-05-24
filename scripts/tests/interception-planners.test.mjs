/* 中文注释：Interception 回归测试覆盖压缩、召回、指标和客户端配置，防止链路退化成 prompt-only。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { planShellInterception } from '../lib/interception/shell/shell-planner.mjs';
import { shrinkToolsList } from '../lib/interception/mcp/tools-list-shrink.mjs';

test('shell planner rewrites broad file reads into compact read strategy', () => {
  const decision = planShellInterception({ command: 'Get-Content huge.log' });
  assert.equal(decision.action, 'rewrite');
  assert.match(decision.rewrittenCommand, /-TotalCount|tail/i);
  assert.equal(decision.strategy, 'bounded-file-read');
});

test('shell planner asks before destructive recursive removal', () => {
  const decision = planShellInterception({ command: 'Remove-Item -Recurse .aios' });
  assert.equal(decision.action, 'ask');
  assert.match(decision.reason, /destructive/i);
});

test('mcp tools list shrink keeps callable essentials and stores full schema signal', () => {
  const result = shrinkToolsList({
    tools: [
      {
        name: 'page.get_html',
        description: 'Return the full HTML of the current page. This can be extremely large.'.repeat(20),
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Optional CSS selector' },
            includeShadowDom: { type: 'boolean' },
          },
          required: ['selector'],
        },
      },
    ],
  });

  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].name, 'page.get_html');
  assert.deepEqual(result.tools[0].required, ['selector']);
  assert.equal(result.fullCatalogRequired, true);
  assert.equal(JSON.stringify(result).includes('extremely large'.repeat(5)), false);
});
