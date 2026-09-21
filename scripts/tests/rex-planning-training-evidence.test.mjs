import test from 'node:test';

import { assertFreshTrainingEvidence } from './fixtures/skill-training-freshness.mjs';

test('rex-planning 当前内容持有受跟踪且哈希新鲜的 V2 训练认证证据', async () => {
  await assertFreshTrainingEvidence(process.cwd(), 'rex-planning');
});
